"""FastAPI application: REST API, SSE progress, static frontend serving, security.

Local mode (default): binds 127.0.0.1 only via run script; no login required.
Remote mode: set AUTOVIRAL_REMOTE=1 AND AUTOVIRAL_ACCESS_TOKEN=<high entropy>;
without a token the app refuses to accept remote-style requests to any mutating
endpoint and warns at startup.
"""
from __future__ import annotations

import json
import logging
import os
import re
import secrets
import shutil
import threading
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import (Depends, FastAPI, File, Form, Header, HTTPException, Query,
                     Request, UploadFile)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import (FileResponse, HTMLResponse, JSONResponse,
                     StreamingResponse)
from pydantic import BaseModel, Field, field_validator

from . import ai_pipeline, db, learning
from .config import (APP_ROOT, DATA_DIR, DEFAULT_MODEL, PROJECTS_DIR, Settings,
                     detect_hw_encoder, disk_info, get_keys, load_settings,
                     save_settings, which)
from .gemini_client import GeminiError, NoKeysConfigured, get_client
from .media import FFmpegError, ffprobe, summarize_probe, classify_kind
from .schemas import STYLE_IDS
from .worker import EVENTS, enqueue_edit, request_cancel, start_worker, stop_worker

log = logging.getLogger("autoviral.api")

ACCESS_TOKEN = os.environ.get("AUTOVIRAL_ACCESS_TOKEN", "").strip()
REMOTE_MODE = os.environ.get("AUTOVIRAL_REMOTE", "0") == "1"
FRONTEND_ORIGIN = os.environ.get("AUTOVIRAL_FRONTEND_ORIGIN", "").strip()

app = FastAPI(title="AutoViral Shorts", version="1.0.0", docs_url=None, redoc_url=None)


@asynccontextmanager
async def lifespan(app_: FastAPI):
    ver = db.init_db()
    log.info("database ready (schema v%s)", ver)
    w = start_worker()
    yield
    stop_worker()


app.router.lifespan_context = lifespan  # type: ignore[attr-defined]

# ---------------------------------------------------------------------------
# Middleware / guards
# ---------------------------------------------------------------------------

if FRONTEND_ORIGIN:
    app.add_middleware(CORSMiddleware, allow_origins=[FRONTEND_ORIGIN],
                       allow_methods=["GET", "POST", "DELETE"], allow_headers=["*"])

MUTATING_METHODS = {"POST", "DELETE", "PUT", "PATCH"}


@app.middleware("http")
async def remote_access_guard(request: Request, call_next):
    """Never expose unauthenticated mutating endpoints in remote mode."""
    if REMOTE_MODE and request.method in MUTATING_METHODS:
        tok = request.headers.get("X-Access-Token", "")
        if not ACCESS_TOKEN or not secrets.compare_digest(tok, ACCESS_TOKEN):
            return JSONResponse({"detail": "remote mode requires X-Access-Token header"},
                                status_code=401)
    return await call_next(request)


# ---------------------------------------------------------------------------
# Models for request validation
# ---------------------------------------------------------------------------

class EditRequest(BaseModel):
    user_prompt: str = Field(default="", max_length=3000)
    style: str = "auto"
    mode: Optional[str] = None          # extract | enhance | auto-detect
    aspect_ratio: Optional[str] = None
    resolution: Optional[str] = None

    @field_validator("style")
    @classmethod
    def _style(cls, v):
        if v not in STYLE_IDS:
            raise ValueError("unknown style")
        return v

    @field_validator("mode")
    @classmethod
    def _mode(cls, v):
        if v not in (None, "extract", "enhance", "auto"):
            raise ValueError("mode must be extract|enhance|auto")
        return v


class ReviewRequest(BaseModel):
    export_id: Optional[str] = None
    rating: int = Field(ge=1, le=5)
    feedback: str = Field(default="", max_length=4000)
    positives: list[str] = Field(default_factory=list, max_length=30)
    negatives: list[str] = Field(default_factory=list, max_length=30)
    aspects: dict[str, int] = Field(default_factory=dict)

    @field_validator("aspects")
    @classmethod
    def _asp(cls, v):
        allowed = {"captions", "pacing", "selection", "effects", "audio"}
        out = {}
        for k, val in v.items():
            if k in allowed and 1 <= int(val) <= 5:
                out[k] = int(val)
        return out


class RenameRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)


SAFE_NAME_RE = re.compile(r"[^\w.\- ]+")


def sanitize_filename(name: str) -> str:
    name = os.path.basename(name or "video")
    name = SAFE_NAME_RE.sub("_", name).strip(" ._") or "video"
    return name[:120]


def project_dir_or_404(pid: str) -> Path:
    if not re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", pid):
        raise HTTPException(400, "invalid project id")
    d = (PROJECTS_DIR / pid).resolve()
    if not str(d).startswith(str(PROJECTS_DIR.resolve())) or not d.is_dir():
        raise HTTPException(404, "project not found")
    return d


def inside_projects(path_str: str) -> Path:
    p = Path(path_str).resolve()
    root = PROJECTS_DIR.resolve()
    if not str(p).startswith(str(root)):
        raise HTTPException(400, "path outside project root")
    return p


# ---------------------------------------------------------------------------
# Health & settings
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    conn = db.get_conn()
    keys = get_keys()
    ffmpeg_ok = bool(which("ffmpeg") and which("ffprobe"))
    try:
        db_ok = conn.execute("SELECT COUNT(*) c FROM projects").fetchone()["c"] is not None
    except Exception:
        db_ok = False
    configured = keys.configured_slots()
    return {
        "status": "ok" if (ffmpeg_ok and db_ok) else "degraded",
        "backend": "up",
        "database": {"ok": db_ok, "path": str(DATA_DIR / "database.sqlite3")},
        "ffmpeg": {"available": ffmpeg_ok, "path": which("ffmpeg"),
                   "hw_encoder": detect_hw_encoder()},
        "gemini": {"configured_slots": configured,
                   "any_configured": bool(configured),
                   "model": keys.model,
                   "note": ("No keys configured — AI analysis disabled; heuristic mode "
                            "still works." if not configured else
                            "Quota may still be shared across keys in one Google project.")},
        "disk": disk_info(),
        "worker": {"thread_alive": threading.active_count() > 1},
        "remote_mode": REMOTE_MODE,
        "access_token_required": bool(ACCESS_TOKEN),
    }


@app.get("/api/gemini/status")
def gemini_status():
    return get_keys().sanitized_status()


@app.get("/api/settings")
def get_settings_api():
    return load_settings(db.get_conn()).to_dict()


@app.post("/api/settings")
def patch_settings(payload: dict):
    conn = db.get_conn()
    s = load_settings(conn)
    clamp_map = {
        "aspect_ratio": lambda v: v if v in ("9:16", "1:1", "16:9") else s.aspect_ratio,
        "resolution": lambda v: v if v in ("1080p", "720p") else s.resolution,
        "style": lambda v: v if v in STYLE_IDS else s.style,
        "caption_position": lambda v: v if v in ("bottom", "middle", "top") else s.caption_position,
        "caption_color": lambda v: v if re.fullmatch(r"#[0-9A-Fa-f]{6}", v or "") else s.caption_color,
        "caption_outline_color": lambda v: v if re.fullmatch(r"#[0-9A-Fa-f]{6}", v or "") else s.caption_outline_color,
        "max_shorts": lambda v: max(1, min(6, int(v))),
        "caption_font_size": lambda v: max(9, min(22, int(v))),
        "loudness_target_lufs": lambda v: max(-24.0, min(-9.0, float(v))),
        "ffmpeg_threads": lambda v: max(0, min(32, int(v))),
        "concurrency": lambda v: max(1, min(2, int(v))),
        "upload_max_mb": lambda v: max(16, min(8192, int(v))),
        "video_max_duration_s": lambda v: max(30, min(4 * 3600, int(v))),
        "short_min_s": lambda v: max(5.0, min(60.0, float(v))),
        "short_max_s": lambda v: max(10.0, min(180.0, float(v))),
    }
    bools = {"captions_enabled", "word_highlight", "audio_normalize",
             "zoom_enabled", "transitions_enabled", "prefer_hw_encoder"}
    for k, v in payload.items():
        if k in clamp_map:
            try:
                setattr(s, k, clamp_map[k](v))
            except (TypeError, ValueError):
                pass
        elif k in bools:
            setattr(s, k, bool(v))
    save_settings(conn, s)
    return s.to_dict()


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------

@app.get("/api/projects")
def list_projects():
    conn = db.get_conn()
    out = []
    for p in db.list_projects(conn):
        ex = db.list_exports(conn, p["id"])
        p["export_count"] = len(ex)
        p["latest_export"] = ex[0] if ex else None
        out.append(p)
    return out


@app.post("/api/projects")
async def create_project(file: UploadFile = File(...),
                         name: str = Form(""),
                         user_prompt: str = Form("", max_length=3000),
                         style: str = Form("auto"),
                         mode: str = Form("auto"),
                         aspect_ratio: str = Form(""),
                         resolution: str = Form("")):
    conn = db.get_conn()
    s = load_settings(conn)
    if style not in STYLE_IDS:
        raise HTTPException(422, "unknown style")
    if mode not in ("auto", "extract", "enhance"):
        raise HTTPException(422, "mode must be auto|extract|enhance")
    if aspect_ratio and aspect_ratio not in ("9:16", "1:1", "16:9"):
        raise HTTPException(422, "bad aspect ratio")
    if resolution and resolution not in ("720p", "1080p"):
        raise HTTPException(422, "bad resolution")

    pid = str(uuid.uuid4())
    src_dir = PROJECTS_DIR / pid / "source"
    src_dir.mkdir(parents=True, exist_ok=True)
    fname = sanitize_filename(file.filename or "video")
    dest = src_dir / fname
    max_bytes = s.upload_max_mb * 1024 * 1024
    written = 0
    try:
        with open(dest, "wb") as f:
            while chunk := await file.read(1024 * 1024):
                written += len(chunk)
                if written > max_bytes:
                    raise HTTPException(413, f"upload exceeds {s.upload_max_mb} MB limit")
                f.write(chunk)
        # Validate actual media with ffprobe — never trust filename/MIME.
        try:
            probe = ffprobe(dest)
        except FFmpegError as e:
            shutil.rmtree(PROJECTS_DIR / pid, ignore_errors=True)
            raise HTTPException(422, f"not a valid video file: {e}")
        meta = summarize_probe(probe)
        if meta["duration_s"] <= 0:
            shutil.rmtree(PROJECTS_DIR / pid, ignore_errors=True)
            raise HTTPException(422, "media has no readable duration")
        if meta["duration_s"] > s.video_max_duration_s:
            shutil.rmtree(PROJECTS_DIR / pid, ignore_errors=True)
            raise HTTPException(422, f"video longer than limit ({s.video_max_duration_s}s)")
        kind = classify_kind(meta)
        eff_mode = mode if mode != "auto" else ("enhance" if kind == "short" else "extract")
        project = {
            "id": pid, "name": (sanitize_filename(name) or fname.rsplit(".", 1)[0])[:80],
            "created_at": _now_iso(), "updated_at": _now_iso(),
            "source_filename": fname, "source_path": f"projects/{pid}/source/{fname}",
            "source_meta": json.dumps(meta), "duration_s": meta["duration_s"],
            "width": meta["width"], "height": meta["height"], "kind": kind,
            "user_prompt": user_prompt.strip(), "style": style,
            "aspect_ratio": aspect_ratio or s.aspect_ratio,
            "resolution": resolution or s.resolution,
            "mode": eff_mode, "status": "draft",
        }
        db.insert_project(conn, project)
        # thumbnail of source for dashboard cards
        try:
            (PROJECTS_DIR / pid / "thumbnails").mkdir(exist_ok=True)
            from .media import make_thumbnail
            make_thumbnail(str(dest), str(PROJECTS_DIR / pid / "thumbnails" / "source.jpg"),
                           at_s=min(1.0, meta["duration_s"] / 3))
        except Exception:
            pass
        return project | {"meta": meta, "mode_detected": kind}
    except HTTPException:
        raise
    finally:
        await file.close()


def _now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@app.get("/api/projects/{pid}")
def get_project(pid: str):
    conn = db.get_conn()
    p = db.get_project(conn, pid)
    if not p:
        raise HTTPException(404, "project not found")
    jobs = [j for j in db.list_jobs(conn) if j["project_id"] == pid]
    plan = db.latest_plan(conn, pid)
    exports = db.list_exports(conn, pid)
    reviews = db.list_reviews(conn, pid)
    thumb = None
    tdir = project_dir_or_404(pid) / "thumbnails"
    if tdir.is_dir():
        files = sorted(tdir.glob("*"))
        if files:
            thumb = files[-1].name
    return {"project": p, "jobs": jobs[:20], "plan": plan, "exports": exports,
            "reviews": reviews, "thumbnail": thumb}


@app.delete("/api/projects/{pid}")
def delete_project(pid: str):
    conn = db.get_conn()
    if not db.get_project(conn, pid):
        raise HTTPException(404, "project not found")
    d = project_dir_or_404(pid)
    db.delete_project_cascade(conn, pid)
    shutil.rmtree(d, ignore_errors=True)
    return {"deleted": pid}


@app.post("/api/projects/{pid}/rename")
def rename_project(pid: str, req: RenameRequest):
    conn = db.get_conn()
    if not db.get_project(conn, pid):
        raise HTTPException(404, "project not found")
    db.update_project(conn, pid, name=req.name.strip()[:80])
    return {"ok": True}


@app.post("/api/projects/{pid}/edit")
def start_edit(pid: str, req: EditRequest):
    conn = db.get_conn()
    p = db.get_project(conn, pid)
    if not p:
        raise HTTPException(404, "project not found")
    fields = {}
    if req.user_prompt:
        fields["user_prompt"] = req.user_prompt
    if req.style != "auto" or not p.get("style"):
        fields["style"] = req.style
    if req.mode and req.mode != "auto":
        fields["mode"] = req.mode
    elif not p.get("mode"):
        fields["mode"] = "enhance" if p.get("kind") == "short" else "extract"
    if req.aspect_ratio:
        fields["aspect_ratio"] = req.aspect_ratio
    if req.resolution:
        fields["resolution"] = req.resolution
    if fields:
        db.update_project(conn, pid, **fields)
    running = conn.execute("SELECT id FROM jobs WHERE project_id=? AND status IN "
                           "('queued','running')", (pid,)).fetchone()
    if running:
        raise HTTPException(409, "this project already has an active job")
    jid = enqueue_edit(pid)
    return {"job_id": jid, "project_id": pid}


@app.post("/api/projects/{pid}/retry")
def retry_project(pid: str):
    conn = db.get_conn()
    p = db.get_project(conn, pid)
    if not p:
        raise HTTPException(404, "project not found")
    if p.get("status") not in ("failed", "cancelled", "done", "draft"):
        raise HTTPException(409, f"cannot retry while status is {p['status']}")
    running = conn.execute("SELECT id FROM jobs WHERE project_id=? AND status IN "
                           "('queued','running')", (pid,)).fetchone()
    if running:
        raise HTTPException(409, "an active job already exists")
    jid = enqueue_edit(pid)
    return {"job_id": jid}


# ---------------------------------------------------------------------------
# Jobs
# ---------------------------------------------------------------------------

@app.get("/api/jobs")
def list_jobs(limit: int = Query(100, ge=1, le=500)):
    return db.list_jobs(db.get_conn(), limit)


@app.get("/api/jobs/{jid}")
def get_job(jid: str):
    j = db.get_job(db.get_conn(), jid)
    if not j:
        raise HTTPException(404, "job not found")
    return j


@app.post("/api/jobs/{jid}/cancel")
def cancel_job(jid: str):
    ok = request_cancel(jid)
    if not ok:
        raise HTTPException(409, "job not cancellable (missing or already finished)")
    return {"cancelled": jid}


@app.get("/api/jobs/{jid}/events")
def job_events(jid: str):
    """Server-Sent Events stream of real render progress."""
    if not db.get_job(db.get_conn(), jid):
        raise HTTPException(404, "job not found")

    def gen():
        ev = EVENTS.subscribe(jid)
        cursor = 0
        try:
            # replay history first
            for item in EVENTS.since(jid, 0):
                cursor += 1
                yield f"data: {json.dumps(item)}\n\n"
                if item.get("status") in ("done", "failed", "cancelled"):
                    return
            deadline = 0
            while deadline < 3600:           # max ~1h stream
                signaled = ev.wait(timeout=2.0)
                ev.clear()
                new = EVENTS.since(jid, cursor)
                if new:
                    for item in new:
                        cursor += 1
                        yield f"data: {json.dumps(item)}\n\n"
                        if item.get("status") in ("done", "failed", "cancelled"):
                            return
                    deadline = 0
                else:
                    deadline += 1
                    if not signaled:
                        yield ": keepalive\n\n"
                    # DB fallback: worker restart / events lost
                    job = db.get_job(db.get_conn(), jid)
                    if job and job["status"] in ("done", "failed", "cancelled"):
                        yield f"data: {json.dumps({'job_id': jid, 'stage': job['stage'], 'progress': job['progress'] or 0, 'status': job['status'], 'error': job['error']})}\n\n"
                        return
        finally:
            EVENTS.unsubscribe(jid, ev)

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ---------------------------------------------------------------------------
# Exports & media streaming
# ---------------------------------------------------------------------------

@app.get("/api/projects/{pid}/exports")
def project_exports(pid: str):
    if not db.get_project(db.get_conn(), pid):
        raise HTTPException(404, "project not found")
    return db.list_exports(db.get_conn(), pid)


@app.get("/api/exports/{eid}/download")
def download_export(eid: str):
    e = db.get_export(db.get_conn(), eid)
    if not e:
        raise HTTPException(404, "export not found")
    path = inside_projects(e["path"])
    if not path.is_file():
        raise HTTPException(410, "file missing on disk")
    return FileResponse(str(path), media_type="video/mp4",
                        filename=e["filename"], headers={"Accept-Ranges": "bytes"})


@app.get("/api/exports/{eid}/srt")
def download_srt(eid: str):
    e = db.get_export(db.get_conn(), eid)
    if not e or not e.get("srt_path"):
        raise HTTPException(404, "subtitles not available")
    path = inside_projects(e["srt_path"])
    if not path.is_file():
        raise HTTPException(410, "file missing on disk")
    return FileResponse(str(path), media_type="text/plain",
                        filename=f"{eid[:8]}.srt")


_RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)")


@app.get("/api/media/{kind}/{pid}/{fname}")
def stream_media(kind: str, pid: str, fname: str, request: Request):
    """Safe ranged streaming for previews (source videos, exports, thumbnails).

    kind: source | export | thumb. Only serves files inside the project tree,
    filenames are sanitized, range requests supported for HTML5 seeking.
    """
    if kind not in ("source", "export", "thumb"):
        raise HTTPException(400, "bad media kind")
    d = project_dir_or_404(pid)
    safe = sanitize_filename(fname)
    subdir = {"source": "source", "export": "exports", "thumb": "thumbnails"}[kind]
    target = (d / subdir / safe).resolve()
    if not str(target).startswith(str((d / subdir).resolve())) or not target.is_file():
        raise HTTPException(404, "media not found")
    size = target.stat().st_size
    ctype = ("image/jpeg" if safe.lower().endswith(".jpg") else
             "video/mp4" if safe.lower().endswith((".mp4", ".mov", ".m4v", ".webm"))
             else "application/octet-stream")
    range_hdr = request.headers.get("range")
    if range_hdr:
        m = _RANGE_RE.match(range_hdr)
        if not m:
            raise HTTPException(416, "bad range")
        start = int(m.group(1) or 0)
        end = int(m.group(2)) if m.group(2) else size - 1
        end = min(end, size - 1)
        if start > end:
            raise HTTPException(416, "unsatisfiable range")
        length = end - start + 1

        def reader():
            with open(target, "rb") as f:
                f.seek(start)
                remaining = length
                while remaining > 0:
                    chunk = f.read(min(256 * 1024, remaining))
                    if not chunk:
                        break
                    remaining -= len(chunk)
                    yield chunk

        return StreamingResponse(reader(), status_code=206, media_type=ctype,
                                 headers={"Content-Range": f"bytes {start}-{end}/{size}",
                                          "Content-Length": str(length),
                                          "Accept-Ranges": "bytes"})

    def full():
        with open(target, "rb") as f:
            while chunk := f.read(256 * 1024):
                yield chunk

    return StreamingResponse(full(), media_type=ctype,
                             headers={"Content-Length": str(size),
                                      "Accept-Ranges": "bytes"})


# ---------------------------------------------------------------------------
# Reviews & preferences
# ---------------------------------------------------------------------------

@app.post("/api/projects/{pid}/review")
def add_review(pid: str, req: ReviewRequest):
    conn = db.get_conn()
    if not db.get_project(conn, pid):
        raise HTTPException(404, "project not found")
    prefs = learning.record_review_and_learn(conn, {
        "project_id": pid, "export_id": req.export_id, "rating": req.rating,
        "feedback": req.feedback, "positives": req.positives,
        "negatives": req.negatives, "aspects": req.aspects})
    return {"ok": True, "learned_preferences": prefs}


@app.get("/api/preferences")
def preferences():
    conn = db.get_conn()
    return {"profile": learning.get_profile(conn),
            "reviews": db.list_reviews(conn)[:100]}


@app.post("/api/preferences/reset")
def reset_preferences():
    conn = db.get_conn()
    learning.reset(conn)
    return {"ok": True}


@app.get("/api/reviews")
def reviews_all():
    return db.list_reviews(db.get_conn())


# ---------------------------------------------------------------------------
# Test render (verifies FFmpeg pipeline without Gemini) — used by diagnostics
# ---------------------------------------------------------------------------

@app.post("/api/diagnostics/test-render")
def test_render():
    """Render a tiny synthetic clip with real FFmpeg and verify it decodes."""
    if not (which("ffmpeg") and which("ffprobe")):
        raise HTTPException(503, "FFmpeg not installed")
    tmpdir = DATA_DIR / "tmp_diagnostics"
    tmpdir.mkdir(exist_ok=True)
    out = tmpdir / f"test_{uuid.uuid4().hex[:8]}.mp4"
    from .media import run_ffmpeg, verify_output
    try:
        run_ffmpeg(["-f", "lavfi", "-i", "testsrc=size=320x240:rate=30:duration=2",
                    "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
                    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "30",
                    "-c:a", "aac", "-shortest", str(out)], timeout=120)
        meta = verify_output(out, expect_audio=True)
        return {"ok": True, "output": out.name, "meta": meta}
    except FFmpegError as e:
        raise HTTPException(500, f"test render failed: {e}")
    finally:
        try:
            out.unlink(missing_ok=True)
        except OSError:
            pass


# ---------------------------------------------------------------------------
# Static frontend (single-origin local mode)
# ---------------------------------------------------------------------------

FRONTEND_DIST = APP_ROOT / "frontend" / "dist"


@app.get("/{full_path:path}")
async def spa(full_path: str):
    if full_path.startswith("api/"):
        raise HTTPException(404, "no such api route")
    if not FRONTEND_DIST.is_dir():
        return HTMLResponse("<h1>AutoViral Shorts</h1>"
                            "<p>Frontend not built yet. Run "
                            "<code>npm install && npm run build</code> in ./frontend, "
                            "or use <code>npm run dev</code> with the Vite proxy.</p>")
    index = FRONTEND_DIST / "index.html"
    candidate = (FRONTEND_DIST / full_path).resolve()
    if full_path and str(candidate).startswith(str(FRONTEND_DIST.resolve())) \
            and candidate.is_file():
        return FileResponse(str(candidate))
    return FileResponse(str(index))

