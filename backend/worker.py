"""SQLite-backed persistent job queue + single heavy worker thread.

Jobs survive restarts (queued jobs are re-picked up; 'running' rows are reset
to queued by db.init_db). One job at a time by default (settings.concurrency).
Cancellation is cooperative via in-memory events AND the DB status column, so
cancel requests from any API thread reach the worker.
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from . import ai_pipeline, db, learning
from .config import PROJECTS_DIR, Settings, load_settings, which
from .gemini_client import GeminiError, NoKeysConfigured
from .media import FFmpegError, ffprobe, summarize_probe
from .renderer import Cancelled, Renderer

log = logging.getLogger("autoviral.worker")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class JobEvents:
    """In-memory pub/sub for SSE progress streams (also mirrored to DB)."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._history: dict[str, list[dict]] = {}
        self._subs: dict[str, list[threading.Event]] = {}

    def publish(self, job_id: str, stage: str, progress: float,
                status: Optional[str] = None, error: Optional[str] = None) -> None:
        evt = {"job_id": job_id, "stage": stage, "progress": round(progress, 4),
               "status": status, "error": error, "ts": _now()}
        with self._lock:
            self._history.setdefault(job_id, []).append(evt)
            if len(self._history[job_id]) > 500:
                self._history[job_id] = self._history[job_id][-300:]
            evs = list(self._subs.get(job_id, []))
        for e in evs:
            e.set()

    def subscribe(self, job_id: str) -> threading.Event:
        e = threading.Event()
        with self._lock:
            self._subs.setdefault(job_id, []).append(e)
        return e

    def unsubscribe(self, job_id: str, e: threading.Event) -> None:
        with self._lock:
            lst = self._subs.get(job_id, [])
            if e in lst:
                lst.remove(e)

    def since(self, job_id: str, n: int) -> list[dict]:
        with self._lock:
            return list(self._history.get(job_id, [])[n:])

    def count(self, job_id: str) -> int:
        with self._lock:
            return len(self._history.get(job_id, []))

    def forget(self, job_id: str) -> None:
        with self._lock:
            self._history.pop(job_id, None)


EVENTS = JobEvents()
_CANCEL_EVENTS: dict[str, threading.Event] = {}
_CANCEL_LOCK = threading.Lock()


def request_cancel(job_id: str) -> bool:
    """Mark cancelled in DB and signal the running worker if it's live."""
    conn = db.get_conn()
    job = db.get_job(conn, job_id)
    if not job or job["status"] in ("done", "failed", "cancelled"):
        return False
    db.update_job(conn, job_id, status="cancelled", finished_at=_now(),
                  stage="cancelled")
    with _CANCEL_LOCK:
        ev = _CANCEL_EVENTS.get(job_id)
    if ev:
        ev.set()
    EVENTS.publish(job_id, "cancelled", job.get("progress") or 0.0, status="cancelled")
    return True


class Worker(threading.Thread):
    """Picks queued jobs one at a time and runs the full pipeline."""

    def __init__(self) -> None:
        super().__init__(daemon=True, name="autoviral-worker")
        self._stop = threading.Event()

    def stop(self) -> None:
        self._stop.set()

    def run(self) -> None:
        log.info("worker started")
        while not self._stop.is_set():
            try:
                job = self._claim_next()
            except Exception as e:  # noqa: BLE001
                log.exception("queue claim failed: %s", e)
                job = None
            if job:
                try:
                    self._process(job["id"])
                except Exception as e:  # noqa: BLE001 — never let the worker die
                    log.exception("job %s crashed: %s", job["id"], e)
                    self._finish(job["id"], "failed", f"internal error: {e}")
            else:
                self._stop.wait(1.0)
        log.info("worker stopped")

    def _claim_next(self) -> Optional[dict]:
        conn = db.get_conn()
        s = load_settings(conn)
        r = conn.execute("SELECT COUNT(*) c FROM jobs WHERE status='running'").fetchone()
        if (r["c"] or 0) >= max(1, s.concurrency):
            return None
        row = conn.execute("SELECT id FROM jobs WHERE status='queued' "
                           "ORDER BY created_at LIMIT 1").fetchone()
        if not row:
            return None
        cur = conn.execute("UPDATE jobs SET status='running', started_at=?, stage='starting' "
                           "WHERE id=? AND status='queued'", (_now(), row["id"]))
        conn.commit()
        if cur.rowcount == 1:
            return db.get_job(conn, row["id"])
        return None

    # ------------------------------------------------------------------

    def _process(self, job_id: str) -> None:
        conn = db.get_conn()
        job = db.get_job(conn, job_id)
        if not job:
            return
        pid = job["project_id"]
        project = db.get_project(conn, pid)
        if not project:
            self._finish(job_id, "failed", "project missing")
            return
        source = str((PROJECTS_DIR / pid / "source" / (project.get("source_filename") or "")).resolve())
        if not Path(source).is_file():
            self._finish(job_id, "failed", f"source file not found on disk: {project.get('source_filename')}")
            return

        cancel_event = threading.Event()
        with _CANCEL_LOCK:
            _CANCEL_EVENTS[job_id] = cancel_event

        def progress(stage: str, p: float):
            db.update_job(conn, job_id, stage=stage, progress=max(0.0, min(1.0, p)))
            EVENTS.publish(job_id, stage, p, status="running")

        try:
            settings = load_settings(conn)
            prefs = learning.get_profile(conn)

            # 1. probe
            progress("probing source", 0.02)
            meta = summarize_probe(ffprobe(source))

            # 2-6. AI plan (or explicit config error when keys absent & fallback off)
            progress("analyzing with Gemini", 0.05)
            mode = project.get("mode") or "extract"
            instruction = project.get("user_prompt") or ""
            allow_fallback = os.environ.get("AUTOVIRAL_ALLOW_HEURISTIC_FALLBACK", "1") == "1"
            try:
                plan, notes, slot, gen = ai_pipeline.generate_plan(
                    source_path=source, meta=meta, user_instruction=instruction,
                    settings=settings, prefs=prefs, mode=mode,
                    allow_fallback=bool(allow_fallback))
            except NoKeysConfigured:
                raise
            db.update_job(conn, job_id, key_slot_used=(slot if slot >= 0 else None))
            db.add_plan(conn, pid, job_id, plan.model_dump(), True,
                        "; ".join(notes) + f" | generator={gen}")
            progress(f"plan ready ({gen}, style={plan.style})", 0.12)

            # 7-9. render
            proj_dir = PROJECTS_DIR / pid
            exports_dir = proj_dir / "exports"
            cap_size = ai_pipeline.effective_caption_font_size(settings, prefs)
            if plan.mode == "enhance":
                from .render_full import render_full_plan
                one = render_full_plan(plan, source, exports_dir, job_id, progress,
                                       cancel_event, settings, cap_size, prefs)
                results = [one]
            else:
                renderer = Renderer(settings, prefs, cap_size)
                results = renderer.render(plan, source, exports_dir, job_id,
                                          progress, cancel_event)

            # 10-11. persist exports
            version_base = db.next_version(conn, pid)
            for i, ex in enumerate(results):
                ex["project_id"] = pid
                ex["job_id"] = job_id
                ex["version"] = version_base + i
                ex["created_at"] = _now()
                db.add_export(conn, {k: v for k, v in ex.items()
                                     if k in ("id", "project_id", "job_id", "version",
                                              "created_at", "path", "filename",
                                              "duration_s", "width", "height",
                                              "size_bytes", "label", "srt_path",
                                              "thumb_path")})
            # analysis artifact saved for transparency
            (proj_dir / "analysis").mkdir(exist_ok=True)
            (proj_dir / "analysis" / f"{job_id}.json").write_text(
                json.dumps({"generator": gen, "notes": notes,
                            "plan": plan.model_dump(), "key_slot": slot}, indent=2),
                encoding="utf-8")
            self._finish(job_id, "done", None, progress_done=True)
            db.update_project(conn, pid, status="done", error=None)
        except Cancelled:
            self._cleanup_tmp(pid, job_id)
            db.update_project(conn, pid, status="cancelled")
            self._finish(job_id, "cancelled", "cancelled by user")
        except NoKeysConfigured as e:
            db.update_project(conn, pid, status="failed", error=str(e))
            self._finish(job_id, "failed", str(e))
        except GeminiError as e:
            msg = f"Gemini analysis failed: {str(e)[:400]}"
            db.update_project(conn, pid, status="failed", error=msg)
            self._finish(job_id, "failed", msg)
        except (FFmpegError, ValueError) as e:
            msg = str(e)[:1500]
            db.update_project(conn, pid, status="failed", error=msg)
            self._finish(job_id, "failed", msg)
        finally:
            with _CANCEL_LOCK:
                _CANCEL_EVENTS.pop(job_id, None)

    def _cleanup_tmp(self, pid: str, job_id: str) -> None:
        tmp = PROJECTS_DIR / pid / "exports" / f".tmp_{job_id}"
        shutil.rmtree(tmp, ignore_errors=True)

    def _finish(self, job_id: str, status: str, error: Optional[str],
                progress_done: bool = False) -> None:
        conn = db.get_conn()
        db.update_job(conn, job_id, status=status, finished_at=_now(),
                      error=error, progress=1.0 if progress_done else None,
                      stage=("completed" if status == "done" else
                             error or status))
        EVENTS.publish(job_id, "completed" if status == "done" else status,
                       1.0 if progress_done else 0.0, status=status, error=error)


_worker: Optional[Worker] = None
_worker_lock = threading.Lock()


def start_worker() -> Worker:
    global _worker
    with _worker_lock:
        if _worker is None or not _worker.is_alive():
            _worker = Worker()
            _worker.start()
        return _worker


def stop_worker() -> None:
    global _worker
    with _worker_lock:
        if _worker:
            _worker.stop()
            _worker = None


def enqueue_edit(project_id: str, parent_version: Optional[int] = None) -> str:
    conn = db.get_conn()
    jid = str(uuid.uuid4())
    db.insert_job(conn, {"id": jid, "project_id": project_id, "created_at": _now(),
                         "status": "queued", "stage": "queued", "progress": 0.0,
                         "parent_version": parent_version})
    db.update_project(conn, project_id, status="queued", error=None, last_job_id=jid)
    EVENTS.publish(jid, "queued", 0.0, status="queued")
    return jid
