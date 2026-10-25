"""Typed edit-plan schema. Every field Gemini returns must validate against this.

The renderer only ever consumes validated, clamped values from these models —
never raw strings from the model for shell/ffmpeg purposes.
"""
from __future__ import annotations

import re
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

STYLE_IDS = {
    "auto", "clean_podcast", "fast_cut_commentary", "gaming_energy", "storytime",
    "educational_explainer", "cinematic", "funny_reaction", "viral_general",
}

_HEX_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")


class Segment(BaseModel):
    """One chosen clip from the source."""
    start_s: float = Field(ge=0)
    end_s: float = Field(gt=0)
    reason: str = ""
    kind: Literal["hook", "content", "payoff", "context"] = "content"

    @model_validator(mode="after")
    def _check(self):
        if self.end_s <= self.start_s:
            raise ValueError("segment end must be after start")
        return self


class CaptionCue(BaseModel):
    start_s: float = Field(ge=0)
    end_s: float = Field(gt=0)
    text: str = Field(min_length=1, max_length=200)

    @model_validator(mode="after")
    def _check(self):
        if self.end_s <= self.start_s:
            raise ValueError("caption end must be after start")
        return self


class ZoomEvent(BaseModel):
    start_s: float = Field(ge=0, description="Output-relative seconds")
    end_s: float = Field(gt=0)
    scale: float = Field(default=1.15, ge=1.0, le=1.4)
    x_frac: float = Field(default=0.5, ge=0.0, le=1.0)
    y_frac: float = Field(default=0.5, ge=0.0, le=1.0)

    @model_validator(mode="after")
    def _check(self):
        if self.end_s <= self.start_s:
            raise ValueError("zoom end must be after start")
        return self


class Transition(BaseModel):
    at_output_s: float = Field(ge=0)
    kind: Literal["fade", "cut"] = "cut"
    duration_s: float = Field(default=0.25, gt=0, le=1.0)


class AudioPlan(BaseModel):
    normalize: bool = True
    target_lufs: float = Field(default=-14.0, ge=-24.0, le=-9.0)
    fade_in_s: float = Field(default=0.0, ge=0, le=2.0)
    fade_out_s: float = Field(default=0.15, ge=0, le=2.0)
    keep_source_audio: bool = True
    music_track_path: Optional[str] = None  # backend-resolved allowlisted path only
    music_volume: float = Field(default=0.0, ge=0.0, le=0.5)


class Reframe(BaseModel):
    mode: Literal["center_crop", "subject_aware", "full_frame_blurred_bg"] = "center_crop"
    x_frac: float = Field(default=0.5, ge=0.0, le=1.0)
    y_frac: float = Field(default=0.5, ge=0.0, le=1.0)


class ExportSettings(BaseModel):
    aspect_ratio: Literal["9:16", "1:1", "16:9"] = "9:16"
    resolution: Literal["1080p", "720p"] = "1080p"
    fps: int = Field(default=30, ge=15, le=60)


class EditPlan(BaseModel):
    """Full structured editing plan produced by Gemini (or automatic heuristics)."""
    objective: str = ""
    mode: Literal["extract", "enhance"] = "extract"
    style: str = "auto"
    target_duration_s: float = Field(default=45.0, gt=0, le=180)
    segments: list[Segment] = Field(default_factory=list)
    hook_segment_index: int = 0
    captions: list[CaptionCue] = Field(default_factory=list)
    zooms: list[ZoomEvent] = Field(default_factory=list)
    transitions: list[Transition] = Field(default_factory=list)
    audio: AudioPlan = Field(default_factory=AudioPlan)
    reframe: Reframe = Field(default_factory=Reframe)
    export: ExportSettings = Field(default_factory=ExportSettings)
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    uncertainty_notes: list[str] = Field(default_factory=list)

    @field_validator("style")
    @classmethod
    def _style_known(cls, v: str):
        if v not in STYLE_IDS:
            raise ValueError(f"unknown style '{v}'")
        return v

    @model_validator(mode="after")
    def _checks(self):
        if not self.segments:
            raise ValueError("plan must contain at least one segment")
        if self.hook_segment_index < 0 or self.hook_segment_index >= len(self.segments):
            self.hook_segment_index = 0
        total = sum(s.end_s - s.start_s for s in self.segments)
        if total > 300:
            raise ValueError(f"plan total duration too long ({total:.1f}s)")
        return self

    def output_duration(self) -> float:
        return sum(max(0.0, s.end_s - s.start_s) for s in self.segments)


def clamp_plan(plan: EditPlan, source_duration: float) -> tuple[EditPlan, list[str]]:
    """Clamp all timestamps to media bounds; drop unusable items. Returns notes."""
    notes: list[str] = []
    segs = []
    for s in plan.segments:
        start = max(0.0, min(s.start_s, max(0.0, source_duration - 0.5)))
        end = min(s.end_s, source_duration)
        if end - start < 0.5:
            notes.append(f"dropped segment {s.start_s:.1f}-{s.end_s:.1f}: too short/out of range")
            continue
        if (start, end) != (s.start_s, s.end_s):
            notes.append(f"clamped segment to {start:.1f}-{end:.1f}")
        s = s.model_copy(update={"start_s": start, "end_s": end})
        segs.append(s)
    if not segs:
        raise ValueError("no valid segments remain after clamping")

    caps = [c for c in plan.captions if c.end_s <= plan.output_duration() + 0.5]
    if len(caps) < len(plan.captions):
        notes.append(f"dropped {len(plan.captions) - len(caps)} out-of-range caption cues")
    zooms = [z for z in plan.zooms if z.end_s <= plan.output_duration() + 0.5]
    trans = [t for t in plan.transitions if t.at_output_s <= plan.output_duration()]

    updated = plan.model_copy(update={"segments": segs, "captions": caps,
                                      "zooms": zooms, "transitions": trans})
    return updated, notes
