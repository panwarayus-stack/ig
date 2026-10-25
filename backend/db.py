"""SQLite persistence with a simple versioned migration mechanism.

One connection per thread (thread-safe for the worker + API threads). WAL mode
so the API can read while the worker writes.
"""
from __future__ import annotations

import json
import sqlite3
import threading
from typing import Any, Optional

from .config import DB_PATH, DATA_DIR, PROJECTS_DIR

_local = threading.local()

SCHEMA_VERSION = 1

MIGRATIONS: dict[int, list[str]] = {
    1: [
        """CREATE TABLE IF NOT EXISTS projects(
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            source_filename TEXT,
            source_path TEXT,
            source_meta TEXT,          -- ffprobe JSON summary
            duration_s REAL,
            width INTEGER,
            height INTEGER,
            kind TEXT,                 -- 'long' | 'short' | 'unknown'
            user_prompt TEXT,
            style TEXT,
            aspect_ratio TEXT,
            resolution TEXT,
            mode TEXT,                 -- 'extract' | 'enhance'
            status TEXT,               -- draft|queued|analyzing|rendering|done|failed|cancelled
            error TEXT,
            last_job_id TEXT
        )""",
        """CREATE TABLE IF NOT EXISTS jobs(
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            created_at TEXT NOT NULL,
            started_at TEXT,
            finished_at TEXT,
            status TEXT NOT NULL,      -- queued|running|done|failed|cancelled
            stage TEXT,
            progress REAL DEFAULT 0,
            error TEXT,
            parent_version INTEGER,
            key_slot_used INTEGER
        )""",
        """CREATE TABLE IF NOT EXISTS plans(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id TEXT NOT NULL,
            job_id TEXT,
            created_at TEXT NOT NULL,
            plan_json TEXT NOT NULL,
            validated INTEGER NOT NULL DEFAULT 0,
            notes TEXT
        )""",
        """CREATE TABLE IF NOT EXISTS exports(
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            job_id TEXT,
            version INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            path TEXT NOT NULL,
            filename TEXT NOT NULL,
            duration_s REAL,
            width INTEGER,
            height INTEGER,
            size_bytes INTEGER,
            label TEXT,
            srt_path TEXT,
            thumb_path TEXT
        )""",
        """CREATE TABLE IF NOT EXISTS reviews(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id TEXT NOT NULL,
            export_id TEXT,
            created_at TEXT NOT NULL,
            rating INTEGER,
            feedback TEXT,
            positives TEXT,   -- JSON list of quick tags
            negatives TEXT,   -- JSON list of quick tags
            aspects TEXT      -- JSON dict: captions/pacing/selection/effects/audio
        )""",
        """CREATE TABLE IF NOT EXISTS preferences(
            key TEXT PRIMARY KEY,
            value REAL NOT NULL,
            updated_at TEXT NOT NULL
        )""",
        """CREATE TABLE IF NOT EXISTS settings(
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )""",
        "CREATE INDEX IF NOT EXISTS idx_jobs_project ON jobs(project_id)",
        "CREATE INDEX IF NOT EXISTS idx_exports_project ON exports(project_id)",
        "CREATE INDEX IF NOT EXISTS idx_reviews_project ON reviews(project_id)",
        "CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)",
    ],
}


def get_conn() -> sqlite3.Connection:
    conn = getattr(_local, "conn", None)
    if conn is None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(DB_PATH), timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA busy_timeout=15000")
        _local.conn = conn
    return conn


def init_db() -> int:
    conn = get_conn()
    conn.execute("CREATE TABLE IF NOT EXISTS schema_version(version INTEGER NOT NULL)")
    row = conn.execute("SELECT MAX(version) v FROM schema_version").fetchone()
    current = row["v"] or 0
    for ver in sorted(MIGRATIONS):
        if ver > current:
            for stmt in MIGRATIONS[ver]:
                conn.executescript(stmt)
            conn.execute("INSERT INTO schema_version(version) VALUES(?)", (ver,))
    # Recover interrupted jobs: anything 'running' whose worker died goes back to queued.
    conn.execute("UPDATE jobs SET status='queued', stage='queued (recovered)' "
                 "WHERE status='running'")
    conn.commit()
    return max(current, SCHEMA_VERSION)


# ---------------------------------------------------------------------------
# Row helpers
# ---------------------------------------------------------------------------

def rows_to_dicts(rows) -> list[dict]:
    out = []
    for r in rows:
        d = dict(r)
        for k in ("source_meta", "plan_json", "positives", "negatives", "aspects"):
            if k in d and isinstance(d[k], str):
                try:
                    d[k] = json.loads(d[k])
                except json.JSONDecodeError:
                    pass
        out.append(d)
    return out


def _now() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def insert_project(conn: sqlite3.Connection, p: dict) -> None:
    cols = ", ".join(p.keys())
    ph = ", ".join("?" for _ in p)
    conn.execute(f"INSERT INTO projects({cols}) VALUES({ph})", list(p.values()))
    conn.commit()


def update_project(conn: sqlite3.Connection, pid: str, **fields: Any) -> None:
    if not fields:
        return
    sets = ", ".join(f"{k}=?" for k in fields)
    conn.execute(f"UPDATE projects SET {sets}, updated_at=? WHERE id=?",
                 [*fields.values(), _now(), pid])
    conn.commit()


def get_project(conn: sqlite3.Connection, pid: str) -> Optional[dict]:
    r = conn.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone()
    return rows_to_dicts([r])[0] if r else None


def list_projects(conn: sqlite3.Connection) -> list[dict]:
    return rows_to_dicts(conn.execute(
        "SELECT * FROM projects ORDER BY updated_at DESC").fetchall())


def insert_job(conn: sqlite3.Connection, job: dict) -> None:
    cols = ", ".join(job.keys())
    ph = ", ".join("?" for _ in job)
    conn.execute(f"INSERT INTO jobs({cols}) VALUES({ph})", list(job.values()))
    conn.commit()


def update_job(conn: sqlite3.Connection, jid: str, **fields: Any) -> None:
    if not fields:
        return
    sets = ", ".join(f"{k}=?" for k in fields)
    conn.execute(f"UPDATE jobs SET {sets} WHERE id=?", list(fields.values()) + [jid])
    conn.commit()


def get_job(conn: sqlite3.Connection, jid: str) -> Optional[dict]:
    r = conn.execute("SELECT * FROM jobs WHERE id=?", (jid,)).fetchone()
    return rows_to_dicts([r])[0] if r else None


def list_jobs(conn: sqlite3.Connection, limit: int = 100) -> list[dict]:
    return rows_to_dicts(conn.execute(
        "SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall())


def next_version(conn: sqlite3.Connection, pid: str) -> int:
    r = conn.execute("SELECT MAX(version) v FROM exports WHERE project_id=?", (pid,)).fetchone()
    return (r["v"] or 0) + 1


def add_export(conn: sqlite3.Connection, e: dict) -> None:
    cols = ", ".join(e.keys())
    ph = ", ".join("?" for _ in e)
    conn.execute(f"INSERT INTO exports({cols}) VALUES({ph})", list(e.values()))
    conn.commit()


def list_exports(conn: sqlite3.Connection, pid: str) -> list[dict]:
    return rows_to_dicts(conn.execute(
        "SELECT * FROM exports WHERE project_id=? ORDER BY version DESC", (pid,)).fetchall())


def get_export(conn: sqlite3.Connection, eid: str) -> Optional[dict]:
    r = conn.execute("SELECT * FROM exports WHERE id=?", (eid,)).fetchone()
    return rows_to_dicts([r])[0] if r else None


def add_plan(conn: sqlite3.Connection, pid: str, job_id: Optional[str], plan: dict,
             validated: bool, notes: str) -> None:
    conn.execute("INSERT INTO plans(project_id,job_id,created_at,plan_json,validated,notes) "
                 "VALUES(?,?,?,?,?,?)",
                 (pid, job_id, _now(), json.dumps(plan), 1 if validated else 0, notes))
    conn.commit()


def latest_plan(conn: sqlite3.Connection, pid: str) -> Optional[dict]:
    r = conn.execute("SELECT * FROM plans WHERE project_id=? ORDER BY id DESC LIMIT 1",
                     (pid,)).fetchone()
    return rows_to_dicts([r])[0] if r else None


def add_review(conn: sqlite3.Connection, rv: dict) -> None:
    conn.execute(
        "INSERT INTO reviews(project_id,export_id,created_at,rating,feedback,positives,negatives,aspects) "
        "VALUES(?,?,?,?,?,?,?,?)",
        (rv["project_id"], rv.get("export_id"), _now(), rv.get("rating"),
         rv.get("feedback"), json.dumps(rv.get("positives", [])),
         json.dumps(rv.get("negatives", [])), json.dumps(rv.get("aspects", {}))))
    conn.commit()


def list_reviews(conn: sqlite3.Connection, pid: Optional[str] = None) -> list[dict]:
    if pid:
        rows = conn.execute("SELECT * FROM reviews WHERE project_id=? ORDER BY created_at DESC",
                            (pid,)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM reviews ORDER BY created_at DESC LIMIT 200").fetchall()
    return rows_to_dicts(rows)


def set_pref(conn: sqlite3.Connection, key: str, value: float) -> None:
    conn.execute("INSERT INTO preferences(key,value,updated_at) VALUES(?,?,?) "
                 "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
                 (key, value, _now()))
    conn.commit()


def all_prefs(conn: sqlite3.Connection) -> dict[str, float]:
    return {r["key"]: r["value"] for r in conn.execute("SELECT key,value FROM preferences")}


def reset_prefs(conn: sqlite3.Connection) -> None:
    conn.execute("DELETE FROM preferences")
    conn.commit()


def delete_project_cascade(conn: sqlite3.Connection, pid: str) -> None:
    for table in ("plans", "exports", "reviews"):
        conn.execute(f"DELETE FROM {table} WHERE project_id=?", (pid,))
    conn.execute("DELETE FROM jobs WHERE project_id=?", (pid,))
    conn.execute("DELETE FROM projects WHERE id=?", (pid,))
    conn.commit()
