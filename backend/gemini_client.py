"""Google GenAI client with three-key automatic fallback.

Rules implemented (spec section 3):
- primary key first; fall back on 429/500/503 + quota/rate-limit/transient errors
- respect Retry-After when supplied
- bounded exponential backoff with jitter
- no rotation for invalid-input / malformed request errors (400-class)
- never log keys or prompt contents
- cooldown per key slot; record which slot succeeded
- File API uploads are tagged per-slot: a file uploaded with key N is only
  reused with key N (different keys may belong to different Google projects).
"""
from __future__ import annotations

import json
import logging
import random
import re
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Optional

from .config import GeminiKeys, get_keys

log = logging.getLogger("autoviral.gemini")

# Error classification -------------------------------------------------------

RETRYABLE_KINDS = {"rate_limit", "quota", "unavailable", "transient"}


def classify_error(status: Optional[int], message: str) -> str:
    m = (message or "").lower()
    if status == 429 or "rate limit" in m or "resource has been exhausted" in m \
            or "too many requests" in m:
        return "rate_limit"
    if "quota" in m and status in (403, 429, None):
        return "quota"
    if status == 503 or "unavailable" in m or "overloaded" in m:
        return "unavailable"
    if status in (500, 502, 504):
        return "transient"
    if status in (400, 401, 403, 404):
        return "invalid_request"
    return "unknown"


def retry_after_seconds(headers: Any) -> Optional[float]:
    try:
        v = headers.get("Retry-After") or headers.get("retry-after")
        if v:
            return max(0.0, float(str(v).split(";")[0].strip()))
    except (ValueError, AttributeError, TypeError):
        pass
    return None


class GeminiError(RuntimeError):
    def __init__(self, message: str, kind: str = "unknown"):
        super().__init__(message)
        self.kind = kind


class NoKeysConfigured(GeminiError):
    def __init__(self):
        super().__init__(
            "No Gemini API keys configured. Set GEMINI_API_KEY_1 (and optionally "
            "_2/_3) in .env to enable AI analysis.", "config")


@dataclass
class _UploadedFile:
    """Tracks a Files-API resource and the key slot that created it."""
    uri: str
    name: str
    slot: int
    mime: str
    expires_hint: Optional[str] = None


class GeminiClient:
    """Thin orchestration over google-genai SDK with key-pool fallback."""

    MAX_ATTEMPTS_PER_CALL = 6          # bounded overall
    MAX_RETRY_AFTER_WAIT = 90.0        # don't sleep forever inside a job

    def __init__(self, keys: Optional[GeminiKeys] = None):
        self.keys = keys or get_keys()
        self._sdk_clients: dict[int, Any] = {}
        self._lock = threading.Lock()
        # video path -> {slot -> file} cache so we never reuse across slots blindly
        self._file_cache: dict[str, dict[int, _UploadedFile]] = {}

    # -- SDK plumbing --------------------------------------------------------

    def _sdk(self, slot: int):
        from google import genai  # imported lazily so app runs without SDK/network
        with self._lock:
            if slot not in self._sdk_clients:
                api_key = self.keys.slots[slot]
                assert api_key
                self._sdk_clients[slot] = genai.Client(api_key=api_key)
            return self._sdk_clients[slot]

    @staticmethod
    def _status_of(exc: Exception) -> Optional[int]:
        for attr in ("code", "status_code"):
            c = getattr(exc, attr, None)
            if isinstance(c, int):
                return c
        resp = getattr(exc, "response", None)
        c = getattr(resp, "status_code", None)
        return c if isinstance(c, int) else None

    @staticmethod
    def _headers_of(exc: Exception):
        resp = getattr(exc, "response", None)
        return getattr(resp, "headers", None)

    # -- public API ----------------------------------------------------------

    def generate_json(self, *, system_prompt: str, user_prompt: str,
                      video_path: Optional[str] = None,
                      schema: Optional[dict] = None,
                      use_agentic_video: bool = False) -> tuple[dict, int]:
        """Call Gemini; return (parsed_json, key_slot_used). Raises GeminiError."""
        if not self.keys.all_configured_order():
            raise NoKeysConfigured()

        last_err: Optional[Exception] = None
        attempts = 0
        # Order: available (non-cooling) slots first, then cooling ones as last resort.
        order = self.keys.available_order() + [
            i for i in self.keys.all_configured_order() if i not in self.keys.available_order()]
        idx_pos = 0
        backoff = 1.0
        while attempts < self.MAX_ATTEMPTS_PER_CALL:
            if idx_pos >= len(order):           # all slots tried this round
                time.sleep(min(backoff, 8.0))   # bounded wait, then re-check cooldowns
                order = self.keys.available_order() or self.keys.all_configured_order()
                idx_pos = 0
                backoff = min(backoff * 2, 30.0)
                if not order:
                    break
            slot = order[idx_pos]
            attempts += 1
            try:
                result = self._call_once(slot, system_prompt, user_prompt,
                                         video_path, schema, use_agentic_video)
                self.keys.mark_success(slot)
                return result, slot
            except Exception as e:  # noqa: BLE001 - classified below
                last_err = e
                status = self._status_of(e)
                msg = str(e)[:400]
                kind = classify_error(status, msg)
                if kind == "invalid_request":
                    # Do NOT rotate keys for bad input — same prompt fails everywhere.
                    sanitized = self._sanitize(msg)
                    raise GeminiError(f"Gemini rejected the request ({status}): {sanitized}",
                                      "invalid_request") from e
                ra = retry_after_seconds(self._headers_of(e))
                self.keys.mark_failure(slot, kind, ra)
                log.warning("Gemini slot %d failed (%s); backing off", slot + 1, kind)
                if ra is not None and ra <= self.MAX_RETRY_AFTER_WAIT:
                    time.sleep(ra + random.uniform(0, 1))
                    idx_pos = max(idx_pos, len(self.keys.available_order()) and 0)
                    order = self.keys.available_order() or order
                    idx_pos = 0
                    continue
                time.sleep(min(backoff + random.uniform(0, 1), 20.0))
                backoff = min(backoff * 2, 30.0)
                idx_pos += 1
                order = self.keys.available_order() + [
                    i for i in self.keys.all_configured_order()
                    if i not in self.keys.available_order()]
        kinds = getattr(last_err, "__class__", Exception).__name__
        raise GeminiError(
            f"All configured Gemini keys failed after {attempts} attempts "
            f"(last error type: {kinds}: {self._sanitize(str(last_err)[:200])})",
            "all_keys_failed")

    def _call_once(self, slot: int, system_prompt: str, user_prompt: str,
                   video_path: Optional[str], schema: Optional[dict],
                   use_agentic_video: bool) -> dict:
        from google.genai import types
        client = self._sdk(slot)
        parts: list[Any] = []
        if video_path:
            f = self._ensure_file(slot, video_path)
            vc_kwargs: dict[str, Any] = {"file_uri": f.uri}
            if use_agentic_video:
                # Documented agentic video understanding flag (SDK >= 1.x).
                try:
                    vc = types.Video(file_uri=f.uri, video_is_embedded=False)
                    parts.append(vc)
                except TypeError:
                    parts.append(types.FileData(file_uri=f.uri, mime_type=f.mime))
            else:
                parts.append(types.Video(file_uri=f.uri))
        parts.append(user_prompt)

        cfg_kwargs: dict[str, Any] = {"temperature": 0.2}
        if schema:
            cfg_kwargs["response_mime_type"] = "application/json"
            cfg_kwargs["response_schema"] = schema
        req = types.GenerateContentConfig(
            system_instruction=system_prompt, **cfg_kwargs)
        resp = client.models.generate_content(
            model=self.keys.model, contents=parts, config=req)
        text = (resp.text or "").strip()
        if not text:
            raise GeminiError("empty response from model", "transient")
        try:
            return json.loads(_extract_json_block(text))
        except json.JSONDecodeError as e:
            raise GeminiError(f"model returned non-JSON: {e}", "transient") from e

    # -- Files API (per-slot project safety) ---------------------------------

    def _ensure_file(self, slot: int, path: str) -> _UploadedFile:
        cached = self._file_cache.get(path, {}).get(slot)
        if cached:
            return cached
        from google.genai import types
        client = self._sdk(slot)
        name = re.sub(r"[^A-Za-z0-9._-]", "_", path.split("/")[-1])[:60]
        up = client.files.upload(file=path, display_name=name)
        # Poll until ACTIVE (bounded)
        deadline = time.time() + 300
        state = getattr(getattr(up, "state", None), "value", None) or getattr(up, "state", None)
        while str(state) not in ("ACTIVE", "State.ACTIVE") and time.time() < deadline:
            time.sleep(3)
            up = client.files.get(name=up.name)
            state = getattr(getattr(up, "state", None), "value", None) or getattr(up, "state", None)
        f = _UploadedFile(uri=up.uri, name=up.name, slot=slot,
                          mime=getattr(up, "mime_type", "video/mp4") or "video/mp4")
        self._file_cache.setdefault(path, {})[slot] = f
        return f

    def cleanup_files(self) -> None:
        """Delete remote files we uploaded (best effort)."""
        for path, by_slot in list(self._file_cache.items()):
            for slot, f in by_slot.items():
                try:
                    self._sdk(slot).files.delete(name=f.name)
                except Exception:
                    pass
            self._file_cache.pop(path, None)

    @staticmethod
    def _sanitize(msg: str) -> str:
        # Strip anything resembling an API key before logging/raising.
        return re.sub(r"AQ[a-zA-Z0-9\-_]{20,}", "[redacted]",
                      re.sub(r"AIza[0-9A-Za-z\-_]{10,}", "[redacted]", msg))


def _extract_json_block(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        t = re.sub(r"^```[a-zA-Z]*\n?", "", t)
        t = re.sub(r"\n?```$", "", t)
    start = t.find("{")
    end = t.rfind("}")
    if start != -1 and end > start:
        return t[start:end + 1]
    return t


_shared: Optional[GeminiClient] = None
_shared_lock = threading.Lock()


def get_client() -> GeminiClient:
    global _shared
    if _shared is None:
        with _shared_lock:
            if _shared is None:
                _shared = GeminiClient()
    return _shared
