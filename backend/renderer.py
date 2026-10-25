"""Renderer: turns a validated EditPlan into real FFmpeg operations.

The model NEVER produces ffmpeg commands; every filter string here is built
from allowlisted, schema-validated numeric/enum values.
"""
from __future__ import annotations

import logging
import os
import re
import shutil
import threading
from pathlib import Path
from typing import Callable, Optional

from .config import Settings, detect_hw_encoder
from .media import (FFmpegError, apply_zoom_filter, ass_time, audio_filter_chain,
                    build_reframe_vf, concat_clips, crossfade_concat, extract_clip,
                    make_thumbnail, run_ffmpeg, srt_from_cues, verify_output,
                    write_ass, _bin)
from .schemas import EditPlan

log = logging.getLogger("autoviral.render")

ProgressCb = Callable[[str, float], None]   # (stage_label, 0..1 overall)


class Cancelled(Exception):
    pass


def _hex_ok(v: str) -> bool:
    return bool(re.fullmatch(r"#[0-9A-Fa-f]{6}", v or ""))


class Renderer:
    def __init__(self, settings: Settings, prefs: dict[str, float],
                 caption_font_size: int):
        self.s = settings
        self.prefs = prefs
        self.caption_font_size = caption_font_size

    # ------------------------------------------------------------------

    def render(self, plan: EditPlan, source: str, out_dir: Path,
               job_id: str, progress: ProgressCb,
               cancel_event: Optional[threading.Event] = None) -> list[dict]:
        """Render all segments of the plan. Returns list of export dicts."""
        out_dir.mkdir(parents=True, exist_ok=True)
        tmp = out_dir / f".tmp_{job_id}"
        tmp.mkdir(exist_ok=True)
        try:
            from_source_meta = _source_dims(source)
            exports = []
            n_seg_total = len(plan.segments)
            for i in range(n_seg_total):
                if cancel_event and cancel_event.is_set():
                    raise Cancelled()
                group = self._group_for_short(plan, i)
                if group is None:
                    continue
                label = f"short {len(exports) + 1}/{n_seg_total}"
                meta_out = self._render_one(group, source, tmp, out_dir, job_id,
                                            label, from_source_meta, progress,
                                            cancel_event)
                exports.append(meta_out)
                progress(label, (i + 1) / max(1, n_seg_total))
            if not exports:
                raise FFmpegError("plan produced zero renderable segments")
            return exports
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    # ------------------------------------------------------------------

    def _group_for_short(self, plan: EditPlan, idx: int) -> Optional[EditPlan]:
        """In 'extract' mode each segment becomes its own Short (with its share of
        captions/zooms remapped). In 'enhance' mode the whole plan is ONE short."""
        if plan.mode == "enhance":
            return plan if idx == 0 else None
        seg = plan.segments[idx]
        dur = seg.end_s - seg.start_s
        # Remap captions/zooms that fall inside this segment's output timeline.
        caps = [c for c in plan.captions if c.start_s < dur and c.end_s > 0]
        if len(plan.segments) > 1 and plan.captions:
            # Model captions are output-relative to the concatenated edit; when we
            # split per-short we cannot know exact mapping — keep cues that fit.
            caps = [c for c in plan.captions if c.end_s <= dur + 0.5]
        zooms = [z for z in plan.zooms if z.end_s <= dur + 0.5]
        return plan.model_copy(update={
            "segments": [seg.model_copy(update={"start_s": seg.start_s, "end_s": seg.end_s})],
            "captions": caps, "zooms": zooms, "transitions": [],
            "hook_segment_index": 0,
            "target_duration_s": dur})

    def _render_one(self, plan: EditPlan, source: str, tmp: Path, out_dir: Path,
                    job_id: str, label: str, src_dims: tuple[int, int, int],
                    progress: ProgressCb,
                    cancel_event: Optional[threading.Event]) -> dict:
        out_w, out_h = Settings.output_size(plan.export.aspect_ratio, plan.export.resolution)
        fps = plan.export.fps
        threads = self.s.ffmpeg_threads
        encoder, crf, preset = self._pick_encoder(out_h)
        sw, sh, rot = src_dims

        parts: list[str] = []
        total_in = sum(s.end_s - s.start_s for s in plan.segments) or 1.0
        done_in = 0.0

        for si, seg in enumerate(plan.segments):
            if cancel_event and cancel_event.is_set():
                raise Cancelled()
            part_path = str(tmp / f"part_{si:03d}.mp4")
            vf = self._build_video_filters(plan, seg, sw, sh, rot, out_w, out_h)
            af = audio_filter_chain(plan.audio.normalize, plan.audio.target_lufs,
                                    plan.audio.fade_in_s if si == 0 else 0.0,
                                    plan.audio.fade_out_s if si == len(plan.segments) - 1 else 0.0,
                                    seg.end_s - seg.start_s)

            def make_cb(si_=si):
                base = si_ / len(plan.segments)
                def cb(f: float):
                    progress(f"{label}: cut {si_ + 1}", base + f / len(plan.segments))
                return cb

            try:
                extract_clip(source, seg.start_s, seg.end_s, part_path,
                             vf=vf, af=af, fps=fps, threads=threads,
                             encoder=encoder, crf=crf, preset=preset,
                             cancel_event=cancel_event, on_progress=make_cb())
            except FFmpegError as e:
                if "cancelled" in str(e):
                    raise Cancelled()
                if encoder != "libx264":
                    log.warning("hw encode failed (%s); retrying with libx264", encoder)
                    extract_clip(source, seg.start_s, seg.end_s, part_path,
                                 vf=vf, af=af, fps=fps, threads=threads,
                                 encoder="libx264", crf=21, preset="veryfast",
                                 cancel_event=cancel_event, on_progress=make_cb())
                else:
                    raise
            parts.append(part_path)
            done_in += seg.end_s - seg.start_s

        # ---- combine ----
        merged = str(tmp / "merged.mp4")
        if len(parts) == 1:
            merged = parts[0]
        elif plan.transitions:
            fade = min(0.3, plan.transitions[0].duration_s)
            try:
                crossfade_concat(parts, merged, fade, out_w, out_h, fps,
                                 plan.audio.keep_source_audio and src_has_audio(source),
                                 threads, cancel_event)
            except FFmpegError:
                concat_clips(parts, merged, cancel_event=cancel_event)
        else:
            concat_clips(parts, merged, cancel_event=cancel_event)

        # ---- captions burn-in (on merged timeline) ----
        final_tmp = str(tmp / "final.mp4")
        cap_cues = [c for c in plan.captions if c.text.strip()]
        burned = False
        if self.s.captions_enabled and cap_cues:
            ass_path = tmp / "captions.ass"
            color = self.s.caption_color if _hex_ok(self.s.caption_color) else "#FFFFFF"
            ocolor = self.s.caption_outline_color if _hex_ok(self.s.caption_outline_color) else "#000000"
            write_ass(cap_cues, str(ass_path), self.caption_font_size, color, ocolor,
                      self.s.caption_position, self.s.word_highlight, out_w, out_h)
            style = (f"FontName=DejaVu Sans,FontSize={self.caption_font_size},"
                     f"PrimaryColour=&H00{rgb2ass(color)},OutlineColour=&H00{rgb2ass(ocolor)},"
                     f"BorderStyle=1,Outline=3,Shadow=1,Bold=1")
            margin = {"bottom": "MarginV=60", "middle": "MarginV=0",
                      "top": "MarginV=60"}.get(self.s.caption_position, "MarginV=60")
            vf_cap = (f"subtitles='{escaped(str(ass_path))}':force_style='"
                      f"{style},{margin}'")
            args = ["-i", merged, "-vf", vf_cap, "-c:v", encoder if encoder != "libx264" else "libx264",
                    "-preset", "veryfast", "-crf", str(crf), "-pix_fmt", "yuv420p",
                    "-c:a", "copy", "-movflags", "+faststart"]
            if threads:
                args += ["-threads", str(threads)]
            args.append(final_tmp)
            try:
                run_ffmpeg(args, timeout=3600, cancel_event=cancel_event)
                burned = True
            except FFmpegError as e:
                if "cancelled" in str(e):
                    raise Cancelled()
                log.warning("caption burn-in failed; continuing without burn-in: %s",
                            str(e)[:150])
        if not burned:
            final_tmp = merged

        # ---- music overlay (user-supplied path only, validated below) ----
        if plan.audio.music_track_path and os.path.isfile(plan.audio.music_track_path):
            mixed = str(tmp / "mixed.mp4")
            vol = plan.audio.music_volume
            args = ["-i", final_tmp, "-stream_loop", "-1", "-i",
                    plan.audio.music_track_path,
                    "-filter_complex",
                    f"[1:a]volume={vol:.2f}[m];[0:a][m]amix=inputs=2:duration=first:"
                    f"dropout_transition=2:normalize=0[aout]",
                    "-map", "0:v", "-map", "[aout]", "-c:v", "copy",
                    "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", mixed]
            try:
                run_ffmpeg(args, timeout=1800, cancel_event=cancel_event)
                final_tmp = mixed
            except FFmpegError:
                pass  # keep video without music rather than fail the whole job

        # ---- verify & move ----
        progress(f"{label}: verifying", 0.97)
        expect_audio = plan.audio.keep_source_audio and src_has_audio(source)
        meta = verify_output(final_tmp, expect_audio=expect_audio)

        eid = new_export_id()
        filename = f"{label.replace(' ', '_')}_{eid[:8]}.mp4"
        dest = out_dir / filename
        shutil.move(final_tmp, str(dest))

        # subtitles + thumbnail artifacts
        sub_dir = out_dir.parent / "subtitles"
        sub_dir.mkdir(exist_ok=True)
        srt_path = None
        if cap_cues:
            srt_path = str(sub_dir / f"{eid[:8]}.srt")
            srt_from_cues(cap_cues, srt_path)
        thumb_dir = out_dir.parent / "thumbnails"
        thumb_dir.mkdir(exist_ok=True)
        thumb_path = str(thumb_dir / f"{eid[:8]}.jpg")
        try:
            make_thumbnail(str(dest), thumb_path, at_s=min(1.0, meta["duration_s"] / 2))
        except FFmpegError:
            thumb_path = None

        return {"id": eid, "path": str(dest), "filename": filename,
                "duration_s": meta["duration_s"], "width": meta["width"],
                "height": meta["height"], "size_bytes": os.path.getsize(dest),
                "label": label, "srt_path": srt_path, "thumb_path": thumb_path}

    # ------------------------------------------------------------------

    def _pick_encoder(self, height: int) -> tuple[str, int, str]:
        hw = detect_hw_encoder() if self.s.prefer_hw_encoder else None
        if hw:
            return hw, 23, "balanced"
        # software: scale quality preset by resolution for speed/quality balance
        preset = "veryfast" if height >= 1080 else "faster"
        return "libx264", 21, preset

    def _build_video_filters(self, plan: EditPlan, seg, sw: int, sh: int, rot: int,
                             out_w: int, out_h: int) -> str:
        stages: list[str] = []
        if rot in (90, 270):
            stages.append("transpose=1" if rot == 90 else "transpose=2")
        stages.append(build_reframe_vf(sw, sh, out_w, out_h, plan.reframe.mode,
                                       plan.reframe.x_frac, plan.reframe.y_frac))
        # zooms are output-timeline relative; only include those overlapping this seg
        seg_dur = seg.end_s - seg.start_s
        zs = [z for z in plan.zooms if z.end_s > 0 and z.start_s < seg_dur + 0.5]
        if self.s.zoom_enabled and zs:
            zf = apply_zoom_filter(out_w, out_h, zs)
            if zf:
                stages.append(zf)
        return ",".join(stages)


# helpers -------------------------------------------------------------------

def _source_dims(path: str) -> tuple[int, int, int]:
    from .media import ffprobe, summarize_probe
    m = summarize_probe(ffprobe(path))
    return m["width"], m["height"], m["rotation"]


def src_has_audio(path: str) -> bool:
    from .media import _has_audio
    return _has_audio(path)


def rgb2ass(hexcol: str) -> str:
    h = hexcol.lstrip("#")
    return f"{h[4:6]}{h[2:4]}{h[0:2]}".upper()


_ESC_RE = re.compile(r"([\\:])")


def escaped(p: str) -> str:
    """Escape a path for use inside an ffmpeg filtergraph (subtitles=...)."""
    return _ESC_RE.sub(r"\\\1", p).replace("'", "\\'")


_seq = threading.Lock()
_counter = 0


def new_export_id() -> str:
    global _counter
    import uuid
    with _seq:
        _counter += 1
    return str(uuid.uuid4())
