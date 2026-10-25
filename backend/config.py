"""Application configuration: environment, paths, settings persistence."""
from __future__ import annotations

import json
import os
import shutil
import sqlite3
import subprocess
import sys
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

APP_ROOT = Path(os.environ.get("AUTOVIRAL_ROOT", str(Path(__file__).resolve().parent.parent)))
DATA_DIR = Path(os.environ.get("AUTOVIRAL_DATA_DIR", str(APP_ROOT / "data")))
PROJECTS_DIR = DATA_DIR / "projects"
DB_PATH = DATA_DIR / "database.sqlite3"

DEFAULT_MODEL = "gemini-3.8-flash"


def load_dotenv(path: Path) -> None:
    """Minimal .env loader (no external dependency). Does not override real env vars."""
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


load_dotenv(APP_ROOT / ".env")


@dataclass
class Settings:
    """User-tunable settings persisted in SQLite `settings` table with env defaults."""
    aspect_ratio: str = "9:16"
    resolution: str = "1080p"          # 1080p -> 1080x1920, 720p -> 720x1280
    max_shorts: int = 3
    short_min_s: float = 15.0
    short_max_s: float = 60.0
    style: str = "auto"                 # auto | clean_podcast | fast_cut | gaming_energy | storytime | educational | cinematic | funny_reaction | viral_general
    captions_enabled: bool = True
    caption_font_size: int = 14         # ASS font size units (PlayRes 1080 tall)
    caption_color: str = "#FFFFFF"
    caption_outline_color: str = "#000000"
    caption_position: str = "bottom"    # bottom | middle | top
    word_highlight: bool = False
    audio_normalize: bool = True
    loudness_target_lufs: float = -14.0
    zoom_enabled: bool = True
    transitions_enabled: bool = True
    ffmpeg_threads: int = 0             # 0 = auto
    prefer_hw_encoder: bool = False
    upload_max_mb: int = 2048
    video_max_duration_s: int = 3 * 3600
    concurrency: int = 1

    _ENV_DEFAULTS = {
        "aspect_ratio": "AUTOVIRAL_ASPECT_RATIO",
        "resolution": "AUTOVIRAL_RESOLUTION",
        "max_shorts": "AUTOVIRAL_MAX_SHORTS",
        "captions_enabled": "AUTOVIRAL_CAPTIONS",
        "audio_normalize": "AUTOVIRAL_AUDIO_NORMALIZE",
        "ffmpeg_threads": "AUTOVIRAL_FFMPEG_THREADS",
        "concurrency": "AUTOVIRAL_CONCURRENCY",
        "upload_max_mb": "AUTOVIRAL_UPLOAD_MAX_MB",
        "video_max_duration_s": "AUTOVIRAL_VIDEO_MAX_DURATION_S",
    }

    @classmethod
    def from_env(cls) -> "Settings":
        s = cls()
        for attr, env in cls._ENV_DEFAULTS.items():
            v = os.environ.get(env)
            if not v:
                continue
            cur = getattr(s, attr)
            try:
                if isinstance(cur, bool):
                    setattr(s, attr, v.lower() in ("1", "true", "yes", "on"))
                elif isinstance(cur, int):
                    setattr(s, attr, int(v))
                elif isinstance(cur, float):
                    setattr(s, attr, float(v))
                else:
                    setattr(s, attr, v)
            except ValueError:
                pass
        return s

    def to_dict(self) -> dict:
        return {k: v for k, v in self.__dict__.items() if not k.startswith("_")}

    @staticmethod
    def output_size(aspect: str, resolution: str) -> tuple[int, int]:
        long_edge = 1920 if resolution == "1080p" else 1280
        short_edge = 1080 if resolution == "1080p" else 720
        if aspect == "9:16":
            return short_edge, long_edge      # w, h
        if aspect == "1:1":
            return short_edge, short_edge
        if aspect == "16:9":
            return long_edge, short_edge
        return short_edge, long_edge


class GeminiKeys:
    """Three-key pool with cooldowns and sanitized status. Never logs secrets."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.slots: list[Optional[str]] = [
            os.environ.get("GEMINI_API_KEY_1") or None,
            os.environ.get("GEMINI_API_KEY_2") or None,
            os.environ.get("GEMINI_API_KEY_3") or None,
        ]
        self.cooldown_until: list[float] = [0.0, 0.0, 0.0]   # epoch seconds
        self.success_count: list[int] = [0, 0, 0]
        self.failure_count: list[int] = [0, 0, 0]
        self.last_error_kind: list[Optional[str]] = [None, None, None]
        self.model = os.environ.get("GEMINI_MODEL", DEFAULT_MODEL)

    def configured_slots(self) -> list[int]:
        return [i + 1 for i, k in enumerate(self.slots) if k]

    def available_order(self) -> list[int]:
        """Slot indexes (0-based) that are configured and not cooling down, primary first."""
        import time
        now = time.time()
        with self._lock:
            return [i for i, k in enumerate(self.slots)
                    if k and self.cooldown_until[i] <= now]

    def all_configured_order(self) -> list[int]:
        with self._lock:
            return [i for i, k in enumerate(self.slots) if k]

    def mark_success(self, idx: int) -> None:
        with self._lock:
            self.success_count[idx] += 1
            self.cooldown_until[idx] = 0.0
            self.last_error_kind[idx] = None

    def mark_failure(self, idx: int, kind: str, retry_after_s: Optional[float] = None) -> None:
        import time
        base_cooldown = {"rate_limit": 60.0, "quota": 120.0, "unavailable": 30.0,
                         "transient": 15.0}.get(kind, 20.0)
        wait = max(retry_after_s or 0.0, base_cooldown)
        with self._lock:
            self.failure_count[idx] += 1
            self.last_error_kind[idx] = kind
            self.cooldown_until[idx] = time.time() + min(wait, 600.0)

    def sanitized_status(self) -> dict:
        import time
        now = time.time()
        with self._lock:
            return {
                "model": self.model,
                "slots": [
                    {
                        "slot": i + 1,
                        "configured": bool(self.slots[i]),
                        "cooling_down": self.cooldown_until[i] > now,
                        "cooldown_remaining_s": max(0, round(self.cooldown_until[i] - now)),
                        "successes": self.success_count[i],
                        "failures": self.failure_count[i],
                        "last_error_kind": self.last_error_kind[i],
                    }
                    for i in range(3)
                ],
            }


def get_keys() -> GeminiKeys:
    global _KEYS
    if _KEYS is None:
        _KEYS = GeminiKeys()
    return _KEYS


_KEYS: Optional[GeminiKeys] = None


def which(tool: str) -> Optional[str]:
    return shutil.which(tool)


_HW_ENCODER_CACHE: dict[str, Optional[str]] = {}


def detect_hw_encoder() -> Optional[str]:
    """Return an available hardware H.264 encoder name, or None (software)."""
    if "name" in _HW_ENCODER_CACHE:
        return _HW_ENCODER_CACHE["name"]
    found = None
    ff = which("ffmpeg")
    if ff:
        try:
            out = subprocess.run([ff, "-hide_banner", "-encoders"], capture_output=True,
                                 text=True, timeout=20).stdout
            for cand in ("h264_nvenc", "h264_qsv", "h264_amf", "h264_videotoolbox"):
                if cand in out:
                    # Presence of the encoder does not guarantee a working device;
                    # the render layer falls back to libx264 on failure.
                    found = cand
                    break
        except Exception:
            found = None
    _HW_ENCODER_CACHE["name"] = found
    return found


def disk_info() -> dict:
    try:
        u = shutil.disk_usage(str(DATA_DIR))
        return {"total_gb": round(u.total / 1e9, 2), "free_gb": round(u.free / 1e9, 2)}
    except OSError:
        return {"total_gb": None, "free_gb": None}


# ---------------------------------------------------------------------------
# Settings persistence helpers (SQLite)
# ---------------------------------------------------------------------------

def load_settings(conn: sqlite3.Connection) -> Settings:
    s = Settings.from_env()
    row = conn.execute("SELECT value FROM settings WHERE key='settings'").fetchone()
    if row:
        try:
            data = json.loads(row[0])
            for k, v in data.items():
                if hasattr(s, k) and not k.startswith("_"):
                    try:
                        cur = getattr(s, k)
                        if isinstance(cur, bool):
                            setattr(s, k, bool(v))
                        elif isinstance(cur, int) and not isinstance(v, bool):
                            setattr(s, k, int(v))
                        elif isinstance(cur, float):
                            setattr(s, k, float(v))
                        else:
                            setattr(s, k, v)
                    except (TypeError, ValueError):
                        pass
        except json.JSONDecodeError:
            pass
    return s


def save_settings(conn: sqlite3.Connection, s: Settings) -> None:
    conn.execute("INSERT INTO settings(key,value) VALUES('settings',?) "
                 "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                 (json.dumps(s.to_dict()),))
    conn.commit()
