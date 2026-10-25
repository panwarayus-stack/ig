"""Review-based personal learning: transparent weighted preference profile.

NOT model retraining — this derives a small numeric profile from accumulated
feedback and injects it into future Gemini prompts + plan adaptation.
Recency-weighted, per-style where useful, bounded to [-1, 1].
"""
from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Optional

from . import db

# Quick-tag -> (preference key, signed delta) mapping.
TAG_WEIGHTS: dict[str, tuple[str, float]] = {
    "too_many_zooms":       ("zoom_frequency", -0.5),
    "good_zooms":           ("zoom_frequency", +0.3),
    "captions_too_large":   ("caption_size", -0.5),
    "captions_great_bold":  ("caption_size", +0.4),
    "captions_too_slow":    ("caption_speed", -0.4),
    "captions_good":        ("caption_quality", +0.4),
    "cuts_too_aggressive":  ("pace", -0.5),
    "good_pacing":          ("pace", +0.4),
    "too_much_dead_air":    ("pace", +0.4),
    "music_too_loud":       ("music_volume", -0.6),
    "bad_hook":             ("hook_strength", -0.5),
    "great_hook":           ("hook_strength", +0.4),
    "wrong_segment":        ("clip_selection", -0.6),
    "great_clips":          ("clip_selection", +0.5),
}

ASPECT_KEYS = {"captions": "caption_quality", "pacing": "pace",
               "selection": "clip_selection", "effects": "zoom_frequency",
               "audio": "audio_quality"}


def _recency_weight(created_iso: str, now: datetime) -> float:
    """Half-life ~30 days; old feedback still counts but fades."""
    try:
        t = datetime.fromisoformat(created_iso)
        if t.tzinfo is None:
            t = t.replace(tzinfo=timezone.utc)
        age_days = max(0.0, (now - t).total_seconds() / 86400.0)
    except ValueError:
        age_days = 60.0
    return 0.5 ** (age_days / 30.0)


def recompute(conn) -> dict[str, float]:
    """Rebuild the whole profile from stored reviews. Deterministic & inspectable."""
    now = datetime.now(timezone.utc)
    acc: dict[str, float] = {}
    wsum: dict[str, float] = {}
    reviews = db.list_reviews(conn)
    for rv in reviews:
        w = _recency_weight(rv["created_at"], now)
        rating = rv.get("rating")
        # overall rating nudges every axis slightly (5 -> +, 1 -> -)
        if isinstance(rating, int):
            base = (rating - 3) * 0.12
            for k in list(ASPECT_KEYS.values()) + ["style_score"]:
                acc[k] = acc.get(k, 0.0) + base * w
                wsum[k] = wsum.get(k, 0.0) + w
        for tag in rv.get("positives", []) or []:
            if tag in TAG_WEIGHTS:
                k, d = TAG_WEIGHTS[tag]
                acc[k] = acc.get(k, 0.0) + d * w
                wsum[k] = wsum.get(k, 0.0) + w
        for tag in rv.get("negatives", []) or []:
            if tag in TAG_WEIGHTS:
                k, d = TAG_WEIGHTS[tag]
                acc[k] = acc.get(k, 0.0) + d * w
                wsum[k] = wsum.get(k, 0.0) + w
        aspects = rv.get("aspects", {}) or {}
        for aspect, val in aspects.items():
            key = ASPECT_KEYS.get(aspect)
            if key and isinstance(val, (int, float)):
                d = (float(val) - 3) * 0.25
                acc[key] = acc.get(key, 0.0) + d * w
                wsum[key] = wsum.get(key, 0.0) + w
        # per-style preferences
        pid = rv.get("project_id")
        style = _project_style(conn, pid)
        if style and style != "auto" and isinstance(rating, int):
            k = f"style:{style}"
            acc[k] = acc.get(k, 0.0) + (rating - 3) * 0.3 * w
            wsum[k] = wsum.get(k, 0.0) + w

    prefs: dict[str, float] = {}
    for k, v in acc.items():
        n = wsum.get(k, 1.0)
        norm = v / max(0.5, math.sqrt(n))     # grow with evidence, sublinearly
        prefs[k] = round(max(-1.0, min(1.0, norm)), 3)
    for k, v in prefs.items():
        db.set_pref(conn, k, v)
    return prefs


_STYLE_CACHE: dict[str, Optional[str]] = {}


def _project_style(conn, pid: Optional[str]) -> Optional[str]:
    if not pid:
        return None
    if pid in _STYLE_CACHE:
        return _STYLE_CACHE[pid]
    p = db.get_project(conn, pid)
    style = (p or {}).get("style")
    _STYLE_CACHE[pid] = style
    return style


def get_profile(conn) -> dict[str, float]:
    return db.all_prefs(conn)


def record_review_and_learn(conn, review: dict) -> dict[str, float]:
    db.add_review(conn, review)
    _STYLE_CACHE.clear()
    return recompute(conn)


def reset(conn) -> None:
    db.reset_prefs(conn)
    _STYLE_CACHE.clear()
