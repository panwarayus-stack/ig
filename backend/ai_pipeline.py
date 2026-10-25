"""AI analysis pipeline: prompts, plan generation, validation, learned-preference injection."""
from __future__ import annotations

import json
import logging
import math
import random
import subprocess
from typing import Optional

from pydantic import ValidationError

from .config import Settings, which
from .gemini_client import GeminiError, NoKeysConfigured, get_client
from .schemas import (AudioPlan, CaptionCue, EditPlan, ExportSettings, Reframe,
                      Segment, Transition, ZoomEvent, clamp_plan)

log = logging.getLogger("autoviral.ai")

SYSTEM_PROMPT = """You are AutoViral's editing director: an expert short-form video editor.
You convert a source video plus optional user instructions into a strict JSON edit plan.

Hard rules:
- All timestamps in SECONDS relative to the SOURCE video, within [0, duration].
- Segments must not overlap, must be ordered chronologically unless the user asks for a rehook order, each 3-75 seconds.
- NEVER invent speech you cannot hear. If uncertain about words, use fewer words or leave captions out and note it.
- Do not cut mid-sentence; extend boundaries to natural pauses.
- Choose meaningful moments (hooks, punchlines, key explanations, payoffs), never arbitrary fixed intervals.
- Avoid near-duplicate segments.
- Only these style ids: clean_podcast, fast_cut_commentary, gaming_energy, storytime, educational_explainer, cinematic, funny_reaction, viral_general.
- zoom scale between 1.0 and 1.4; keep at most one zoom per 12 output seconds.
- Transitions: only 'fade' or 'cut'. Use sparingly.
- You may recommend FEWER shorts than requested if content doesn't support more.
- Output ONLY the JSON object matching the schema. No prose."""


def _prefs_block(prefs: dict[str, float]) -> str:
    if not prefs:
        return ""
    lines = []
    for k, v in sorted(prefs.items(), key=lambda kv: -abs(kv[1])):
        if abs(v) < 0.15:
            continue
        lines.append(f"- {k}: {'+' if v > 0 else ''}{v:.2f}")
    if not lines:
        return ""
    return ("\n\nLEARNED USER PREFERENCES (from past feedback; obey unless the current "
            "instruction overrides them; higher absolute value = stronger signal):\n"
            + "\n".join(lines))


def build_user_prompt(meta: dict, user_instruction: str, settings: Settings,
                      prefs: dict[str, float], mode: str,
                      transcript: Optional[list[dict]] = None) -> str:
    aspect = f"{meta['width']}x{meta['height']}, {meta['duration_s']:.0f}s, " \
             f"{meta.get('fps', 30)} fps, audio={'yes' if meta['has_audio'] else 'no'}"
    parts = [
        f"SOURCE: duration={meta['duration_s']}s ({aspect}).",
        f"TASK MODE: {mode} " + ("(input is already a vertical Short — enhance the whole video, "
                                 "segments should together cover the improved version)"
                                 if mode == "enhance" else
                                 "(extract the best distinct Shorts from this long video)"),
        f"Requested max number of shorts: {settings.max_shorts}; "
        f"target each {settings.short_min_s}-{settings.short_max_s}s.",
        f"Requested style: {settings.style}" + ("" if settings.style != "auto"
                                                else " (you choose the best style)"),
        f"Captions wanted: {'yes' if settings.captions_enabled else 'no'}.",
    ]
    if user_instruction.strip():
        parts.append("USER INSTRUCTION (highest priority): " + user_instruction.strip()[:1500])
    else:
        parts.append("USER INSTRUCTION: (blank — infer genre, pick the best style automatically, "
                     "generate the strongest possible edit without asking questions)")
    if transcript:
        tr = "\n".join(f"[{seg['start']:.1f}-{seg['end']:.1f}] {seg['text']}"
                       for seg in transcript[:400])
        parts.append("LOCAL TRANSCRIPT (may be imperfect; trust your own hearing over it):\n" + tr)
    parts.append(_prefs_block(prefs))
    parts.append("Return the JSON edit plan now.")
    return "\n".join(p for p in parts if p)


PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "objective": {"type": "string"},
        "mode": {"type": "string", "enum": ["extract", "enhance"]},
        "style": {"type": "string"},
        "target_duration_s": {"type": "number"},
        "segments": {"type": "array", "items": {
            "type": "object",
            "properties": {
                "start_s": {"type": "number"}, "end_s": {"type": "number"},
                "reason": {"type": "string"},
                "kind": {"type": "string", "enum": ["hook", "content", "payoff", "context"]},
            },
            "required": ["start_s", "end_s"],
        }},
        "hook_segment_index": {"type": "integer"},
        "captions": {"type": "array", "items": {
            "type": "object",
            "properties": {"start_s": {"type": "number"}, "end_s": {"type": "number"},
                           "text": {"type": "string"}},
            "required": ["start_s", "end_s", "text"],
        }},
        "zooms": {"type": "array", "items": {
            "type": "object",
            "properties": {"start_s": {"type": "number"}, "end_s": {"type": "number"},
                           "scale": {"type": "number"}, "x_frac": {"type": "number"},
                           "y_frac": {"type": "number"}},
            "required": ["start_s", "end_s"],
        }},
        "transitions": {"type": "array", "items": {
            "type": "object",
            "properties": {"at_output_s": {"type": "number"},
                           "kind": {"type": "string", "enum": ["fade", "cut"]},
                           "duration_s": {"type": "number"}},
            "required": ["at_output_s"],
        }},
        "audio": {"type": "object", "properties": {
            "normalize": {"type": "boolean"}, "target_lufs": {"type": "number"},
            "fade_in_s": {"type": "number"}, "fade_out_s": {"type": "number"},
            "keep_source_audio": {"type": "boolean"}}},
        "reframe": {"type": "object", "properties": {
            "mode": {"type": "string"}, "x_frac": {"type": "number"},
            "y_frac": {"type": "number"}}},
        "export": {"type": "object", "properties": {
            "aspect_ratio": {"type": "string"}, "resolution": {"type": "string"},
            "fps": {"type": "integer"}}},
        "confidence": {"type": "number"},
        "uncertainty_notes": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["segments"],
}


def parse_plan(raw: dict) -> EditPlan:
    """Validate raw model JSON against the strict Pydantic schema. Raises ValueError."""
    try:
        return EditPlan.model_validate(raw)
    except ValidationError as e:
        raise ValueError(f"edit plan failed validation: {e.errors()[:6]}") from e


# ---------------------------------------------------------------------------
# Local helpers: silence detection & optional whisper transcription
# ---------------------------------------------------------------------------

def detect_silence(path: str, duration: float, threshold_db: int = -35,
                   min_silence: float = 0.6) -> list[tuple[float, float]]:
    """silencedetect filter -> list of (start,end) silent ranges. Real audio analysis."""
    ff = which("ffmpeg")
    if not ff or duration <= 0:
        return []
    try:
        p = subprocess.run(
            [ff, "-hide_banner", "-nostats", "-i", path, "-af",
             f"silencedetect=noise={threshold_db}dB:d={min_silence}",
             "-f", "null", "-"],
            capture_output=True, text=True, timeout=int(duration * 2) + 120)
    except (subprocess.TimeoutExpired, OSError):
        return []
    out: list[tuple[float, float]] = []
    cur_start: Optional[float] = None
    for line in (p.stderr or "").splitlines():
        if "silence_start:" in line:
            try:
                cur_start = float(line.split("silence_start:")[1].strip().split()[0])
            except ValueError:
                pass
        elif "silence_end:" in line and cur_start is not None:
            try:
                end = float(line.split("silence_end:")[1].strip().split()[0])
                out.append((cur_start, end))
                cur_start = None
            except ValueError:
                pass
    return out


def transcribe_local(path: str) -> Optional[list[dict]]:
    """Optional local ASR via faster-whisper if installed. Returns None if unavailable."""
    try:
        from faster_whisper import WhisperModel  # type: ignore
    except ImportError:
        return None
    try:
        model = WhisperModel("tiny", device="cpu", compute_type="int8")
        segments, _ = model.transcribe(path, vad_filter=True, condition_on_previous_text=False)
        return [{"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip()}
                for s in segments][:600]
    except Exception as e:  # noqa: BLE001
        log.warning("local transcription failed: %s", type(e).__name__)
        return None


def cues_from_transcript(transcript: list[dict], max_words: int = 7,
                         max_dur: float = 3.0) -> list[CaptionCue]:
    """Split transcript segments into readable caption cues with punctuation preserved."""
    cues: list[CaptionCue] = []
    for seg in transcript:
        words = seg["text"].split()
        if not words:
            continue
        n_chunks = max(1, math.ceil(len(words) / max_words))
        chunk = math.ceil(len(words) / n_chunks)
        dur = max(0.2, seg["end"] - seg["start"])
        span = dur / n_chunks
        for i in range(0, len(words), chunk):
            idx = i // chunk
            start = seg["start"] + idx * span
            end = min(seg["end"], start + span)
            text = " ".join(words[i:i + chunk]).strip()
            if text and end > start:
                cues.append(CaptionCue(start_s=round(start, 2),
                                       end_s=round(end, 2), text=text[:200]))
    return cues[:200]


# ---------------------------------------------------------------------------
# Heuristic fallback plan (used when Gemini fails; marked clearly as non-AI)
# ---------------------------------------------------------------------------

def heuristic_plan(meta: dict, settings: Settings, mode: str) -> EditPlan:
    """Content-aware fallback using real audio analysis (silence pattern), NOT fixed intervals."""
    dur = meta["duration_s"]
    silences = detect_silence(str(meta["_path"]), dur) if "_path" in meta else []
    target_each = min(settings.short_max_s, max(settings.short_min_s, min(45, dur)))

    def score_window(start: float, length: float) -> float:
        """Prefer windows with less silence and that avoid edges/overlaps."""
        sil_in = sum(min(e, start + length) - max(s, start) for s, e in silences
                     if s < start + length and e > start)
        return length - sil_in * 2.5

    segs: list[Segment] = []
    step = max(5.0, dur / 40)
    candidates = [(t, score_window(t, target_each))
                  for t in [i * step for i in range(int(max(1, dur - target_each) // step) + 1)]
                  if t + target_each <= dur + 0.5]
    candidates.sort(key=lambda c: -c[1])
    chosen: list[tuple[float, float]] = []
    for t, _score in candidates:
        if all(abs(t - c0) > target_each for c0, _c1 in chosen):
            chosen.append((t, min(dur, t + target_each)))
        if len(chosen) >= settings.max_shorts:
            break
    if not chosen:
        chosen = [(0, min(dur, target_each))]
    if mode == "enhance":
        # Cover whole video minus dead air > 1.2s
        keep: list[tuple[float, float]] = []
        cursor = 0.0
        for s, e in sorted(silences):
            if e - s >= 1.2 and s > cursor:
                keep.append((cursor, s))
                cursor = e
        if cursor < dur:
            keep.append((cursor, dur))
        keep = [(a, b) for a, b in keep if b - a >= 0.8]
        if keep:
            chosen = keep
        merged: list[Segment] = []
        for a, b in chosen:
            if merged and a - merged[-1].end_s < 0.05:
                merged[-1].end_s = b
            else:
                merged.append(Segment(start_s=a, end_s=b, kind="content",
                                      reason="kept speech region (dead air removed)"))
        segs = merged or [Segment(start_s=0, end_s=min(dur, 60), kind="content")]
    else:
        segs = [Segment(start_s=a, end_s=b, kind="hook" if i == 0 else "content",
                        reason="highest speech-density window (heuristic, no AI available)")
                for i, (a, b) in enumerate(chosen)]

    zooms = ([ZoomEvent(start_s=1.0, end_s=min(4.0, segs[0].end_s - segs[0].start_s - 0.1),
                        scale=1.15)] if settings.zoom_enabled and segs else [])
    return EditPlan(
        objective="Automatic heuristic edit (Gemini unavailable)",
        mode=mode, style="viral_general" if settings.style == "auto" else settings.style,
        target_duration_s=target_each, segments=segs[:settings.max_shorts],
        hook_segment_index=0, captions=[], zooms=zooms,
        transitions=[Transition(at_output_s=sum(s.end_s - s.start_s for s in segs[:i+1]),
                                kind="fade") for i in range(len(segs) - 1)]
        if settings.transitions_enabled and len(segs) > 1 else [],
        audio=AudioPlan(normalize=settings.audio_normalize,
                        target_lufs=settings.loudness_target_lufs),
        reframe=Reframe(), export=ExportSettings(aspect_ratio=settings.aspect_ratio,
                                                 resolution=settings.resolution),
        confidence=0.2,
        uncertainty_notes=["Generated by local heuristics because Gemini analysis failed. "
                           "Retry the job once keys work for AI-quality selection."])


# ---------------------------------------------------------------------------
# Top-level: produce a validated plan for a project
# ---------------------------------------------------------------------------

def generate_plan(*, source_path: str, meta: dict, user_instruction: str,
                  settings: Settings, prefs: dict[str, float], mode: str,
                  allow_fallback: bool = True) -> tuple[EditPlan, list[str], int, str]:
    """Returns (plan, notes, key_slot_used, generator). Raises GeminiError if AI required."""
    meta = {**meta, "_path": source_path}
    gen = "gemini"
    notes: list[str] = []
    client = get_client()
    transcript = None
    use_agentic = (meta["duration_s"] or 0) > 600
    # If Gemini isn't configured, ask the model for captions anyway; if it fails we
    # fall back to local ASR only when faster-whisper is installed.
    try:
        raw, slot = client.generate_json(
            system_prompt=SYSTEM_PROMPT,
            user_prompt=build_user_prompt(meta, user_instruction, settings, prefs,
                                          mode, transcript),
            video_path=source_path, schema=PLAN_SCHEMA,
            use_agentic_video=use_agentic)
        plan = parse_plan(raw)
        # Apply learned-preference clamping on top of model output
        plan = adapt_plan_to_prefs(plan, prefs, settings)
        plan, clamp_notes = clamp_plan(plan, meta["duration_s"])
        notes += clamp_notes
        if plan.mode != mode:
            plan = plan.model_copy(update={"mode": mode})
            notes.append(f"forced mode to '{mode}' based on input classification")
        return plan, notes, slot, gen
    except NoKeysConfigured:
        raise
    except (GeminiError, ValueError) as e:
        notes.append(f"Gemini plan failed: {str(e)[:300]}")
        if not allow_fallback:
            raise
        plan = heuristic_plan(meta, settings, mode)
        # Optional local captions fallback (only if faster-whisper present)
        if settings.captions_enabled and meta.get("has_audio"):
            tr = transcribe_local(source_path)
            if tr:
                plan = plan.model_copy(update={"captions": cues_from_transcript(tr)})
                notes.append("captions from local ASR fallback")
        plan, clamp_notes = clamp_plan(plan, meta["duration_s"])
        notes += clamp_notes
        return plan, notes, -1, "heuristic"


def adapt_plan_to_prefs(plan: EditPlan, prefs: dict[str, float],
                        settings: Settings) -> EditPlan:
    """Transparent weighted-preference adaptation (not model retraining)."""
    updates: dict = {}
    z_factor = prefs.get("zoom_frequency", 0.0)     # negative => fewer zooms
    if z_factor < -0.2 and plan.zooms:
        keep = max(0, round(len(plan.zooms) * (1 + z_factor)))
        updates["zooms"] = plan.zooms[:keep]
        # also soften remaining zooms
        updates["zooms"] = [z.model_copy(update={"scale": max(1.02, z.scale * (1 + min(z_factor, 0) * 0.5))})
                            for z in plan.zooms[:keep]]
    pace = prefs.get("pace", 0.0)
    if pace > 0.3 and len(plan.segments) > 1:      # user likes faster pacing -> trim tails
        updates["segments"] = [
            s.model_copy(update={"end_s": s.end_s - min(0.5, (s.end_s - s.start_s) * 0.05)})
            if s.end_s - s.start_s > 6 else s for s in plan.segments]
    if prefs.get("music_volume", 0.0) < -0.3 and plan.audio.music_volume > 0:
        updates["audio"] = plan.audio.model_copy(
            update={"music_volume": max(0.0, plan.audio.music_volume * 0.5)})
    cap_size_pref = prefs.get("caption_size", 0.0)
    if cap_size_pref < -0.3 and settings.caption_font_size > 10:
        pass  # handled at burn-in stage via effective font size
    return plan.model_copy(update=updates) if updates else plan


def effective_caption_font_size(settings: Settings, prefs: dict[str, float]) -> int:
    adj = prefs.get("caption_size", 0.0)
    return max(9, min(22, int(settings.caption_font_size + round(adj * 4))))
