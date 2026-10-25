"""Full-pipeline render for 'enhance' mode: build the whole improved Short in ONE
ffmpeg invocation using trim/atrim + concat (+ xfade when transitions requested).

This avoids codec-parameter mismatches between separately encoded parts and is
the path used when a plan has multiple segments in one output.
"""
from __future__ import annotations

import logging
import os
import re
import shutil
from pathlib import Path
from typing import Callable, Optional

from .media import (FFmpegError, run_ffmpeg, verify_output, write_ass, _bin,
                    ffprobe, summarize_probe)
from .schemas import EditPlan

log = logging.getLogger("autoviral.render_full")


def _q(s: str) -> str:
    """Quote a filtergraph value safely."""
    return s.replace("\\", "\\\\").replace("'", "\\'")


def build_full_filtergraph(plan: EditPlan, src_w: int, src_h: int, rot: int,
                           out_w: int, out_h: int, fps: int, has_audio: bool,
                           ass_path: Optional[str], caption_style: Optional[str],
                           zoom_enabled: bool) -> tuple[str, str, Optional[str], float]:
    """Return one filter_complex string implementing the whole plan."""
    n = len(plan.segments)
    graph: list[str] = []
    durations: list[float] = []

    def reframe_stage() -> str:
        stages = []
        if rot in (90, 270):
            stages.append("transpose=1" if rot == 90 else "transpose=2")
        ar_in = src_w / max(1, src_h)
        ar_out = out_w / out_h
        # cover-crop to target aspect then exact scale (square pixels guaranteed)
        if abs(ar_in - ar_out) > 0.001:
            stages.append(f"scale={out_w}:{out_h}:force_original_aspect_ratio=increase")
            stages.append(f"crop={out_w}:{out_h}")
        else:
            stages.append(f"scale={out_w}:{out_h}")
        return ",".join(stages)

    for i, seg in enumerate(plan.segments):
        d = seg.end_s - seg.start_s
        durations.append(d)
        graph.append(f"[0:v]trim=start={seg.start_s:.3f}:end={seg.end_s:.3f},"
                     f"setpts=PTS-STARTPTS[v{i}]")
        if has_audio:
            graph.append(f"[0:a]atrim=start={seg.start_s:.3f}:end={seg.end_s:.3f},"
                         f"asetpts=PTS-STARTPTS[a{i}]")

    # per-segment reframe (identical chain — cheap and consistent)
    rf = reframe_stage()
    for i in range(n):
        graph.append(f"[v{i}]{rf}[r{i}]")

    # zooms are OUTPUT-timeline events; apply them AFTER concatenation on [c0].
    # concat first:
    fade = None
    if plan.transitions and n > 1:
        fade = min(0.4, max(0.1, plan.transitions[0].duration_s))
        acc = "[r0]"
        offset = durations[0] - fade
        for i in range(1, n):
            out = f"[x{i}]"
            graph.append(f"{acc}[r{i}]xfade=transition=fade:duration={fade:.3f}"
                         f":offset={max(0.05, offset):.3f}{out}")
            acc = out
            offset += durations[i] - fade
        graph.append(f"{acc}null[cat]")
        if has_audio:
            aprev = "[a0]"
            for i in range(1, n):
                aout = f"[ax{i}]"
                graph.append(f"{aprev}[a{i}]acrossfade=d={fade:.3f}{aout}")
                aprev = aout
            graph.append(f"{aprev}anull[acat]")
    else:
        ins = "".join(f"[r{i}]" for i in range(n))
        graph.append(f"{ins}concat=n={n}:v=1" + (":a=1[acat]" if has_audio else "[cat]"))
        if has_audio:
            # proper v+a concat
            graph.pop()
            ins_a = "".join(f"[a{i}]" for i in range(n))
            both = "".join(f"[r{i}][a{i}]" for i in range(n))
            graph.append(f"{both}concat=n={n}:v=1:a=1[cat][acat]")

    cur_v = "[cat]"
    total = sum(durations)
    if fade and has_audio:
        total = total - fade * (n - 1)

    # zoom punch-ins via dynamic crop on concatenated timeline
    zs = [z for z in plan.zooms if z.scale > 1.0 and z.end_s > z.start_s] \
        if zoom_enabled else []
    if zs:
        from .media import apply_zoom_filter
        zf = apply_zoom_filter(out_w, out_h, zs)
        if zf:
            graph.append(f"{cur_v}{zf.replace('crop=', 'crop=', 1)}[zm]")
            cur_v = "[zm]"

    # captions burn-in inside the same graph (no extra encode pass)
    if ass_path and caption_style:
        graph.append(f"{cur_v}subtitles=filename='{_q(ass_path)}':"
                     f"force_style='{_q(caption_style)}'[vc]")
        cur_v = "[vc]"

    # audio processing chain
    cur_a = "[acat]" if has_audio else None
    if has_audio:
        af_parts = []
        if plan.audio.normalize:
            af_parts.append(f"loudnorm=I={plan.audio.target_lufs:.1f}:TP=-1.5:LRA=11")
        if plan.audio.fade_in_s > 0:
            af_parts.append(f"afade=t=in:d={plan.audio.fade_in_s:.2f}")
        if plan.audio.fade_out_s > 0 and total > plan.audio.fade_out_s:
            af_parts.append(f"afade=t=out:st={max(0, total - plan.audio.fade_out_s):.2f}"
                            f":d={plan.audio.fade_out_s:.2f}")
        if af_parts:
            graph.append(f"{cur_a}{','.join(af_parts)}[va]")
            cur_a = "[va]"

    return ";\n".join(graph), cur_v, cur_a, total


def render_full_plan(plan: EditPlan, source: str, dest_dir: Path, job_id: str,
                     progress: Callable[[str, float], None],
                     cancel_event, settings, caption_font_size: int,
                     prefs: dict) -> dict:
    """Render an entire multi-segment plan into one MP4 with a single ffmpeg pass."""
    from .renderer import _hex_ok, rgb2ass  # reuse small helpers

    probe = summarize_probe(ffprobe(source))
    src_w, src_h, rot = probe["width"], probe["height"], probe["rotation"]
    has_audio = probe["has_audio"]
    out_w, out_h = _out_size(plan.export.aspect_ratio, plan.export.resolution)
    fps = plan.export.fps

    dest_dir.mkdir(parents=True, exist_ok=True)
    tmp = dest_dir / f".tmp_{job_id}_full"
    tmp.mkdir(exist_ok=True)
    try:
        ass_path = None
        style = None
        cues = [c for c in plan.captions if c.text.strip()]
        if settings.captions_enabled and cues:
            ass_file = tmp / "captions.ass"
            color = settings.caption_color if _hex_ok(settings.caption_color) else "#FFFFFF"
            ocolor = (settings.caption_outline_color if _hex_ok(settings.caption_outline_color)
                      else "#000000")
            write_ass(cues, str(ass_file), caption_font_size, color, ocolor,
                      settings.caption_position, settings.word_highlight, out_w, out_h)
            margin = {"bottom": "60", "middle": "0", "top": "60"}.get(
                settings.caption_position, "60")
            style = (f"FontName=DejaVu Sans,FontSize={caption_font_size},"
                     f"PrimaryColour=&H00{rgb2ass(color)},"
                     f"OutlineColour=&H00{rgb2ass(ocolor)},BorderStyle=1,Outline=3,"
                     f"Shadow=1,Bold=1,MarginV={margin},Alignment=2")
            ass_path = str(ass_file)

        fc, cur_v, cur_a, total = build_full_filtergraph(
            plan, src_w, src_h, rot, out_w, out_h, fps, has_audio, ass_path, style,
            settings.zoom_enabled)

        encoder, crf = _pick_encoder(settings)
        out_tmp = str(tmp / "render.mp4")
        args = ["-i", source, "-filter_complex", fc, "-map", cur_v]
        if has_audio:
            args += ["-map", cur_a, "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2"]
        else:
            args += ["-an"]
        args += ["-c:v", encoder, "-r", str(fps), "-pix_fmt", "yuv420p",
                 "-movflags", "+faststart"]
        if encoder == "libx264":
            args += ["-preset", "veryfast", "-crf", str(crf)]
        else:
            args += ["-b:v", "8M"]
        if settings.ffmpeg_threads:
            args += ["-threads", str(settings.ffmpeg_threads)]
        args.append(out_tmp)

        est_total = max(1.0, total)

        def on_line(line: str):
            m = re.search(r"time=(\d+):(\d+):(\d+(?:\.\d+)?)", line)
            if m:
                h, mi, s = int(m.group(1)), int(m.group(2)), float(m.group(3))
                frac = min(1.0, (h * 3600 + mi * 60 + s) / est_total)
                progress("rendering", 0.15 + 0.75 * frac)

        progress("rendering", 0.15)
        try:
            run_ffmpeg(args, timeout=int(max(600, est_total * 90)),
                       on_line=on_line, cancel_event=cancel_event)
        except FFmpegError as e:
            if "cancelled" in str(e):
                raise
            if encoder != "libx264":
                log.warning("hw encode failed, retrying libx264: %s", str(e)[:200])
                args[args.index("-c:v")] = "libx264"
                # replace any hw-specific flags conservatively: rebuild simply
                args = [a for a in args if a not in ("8M", "-b:v")]
                args = args[:args.index("-movflags")] + \
                    ["-preset", "veryfast", "-crf", "21"] + args[args.index("-movflags"):]
                # ensure -c:v libx264 present exactly once
                run_ffmpeg(args, timeout=int(max(600, est_total * 90)),
                           on_line=on_line, cancel_event=cancel_event)
            else:
                raise

        progress("verifying output", 0.93)
        meta = verify_output(out_tmp, expect_audio=has_audio)

        eid = _export_id()
        filename = f"v{_next_version_hint(dest_dir)}_{eid[:8]}.mp4"
        dest = dest_dir / filename
        shutil.move(out_tmp, str(dest))

        srt_path = None
        if cues:
            sub_dir = dest_dir.parent / "subtitles"
            sub_dir.mkdir(exist_ok=True)
            from .media import srt_from_cues
            srt_path = str(sub_dir / f"{eid[:8]}.srt")
            srt_from_cues(cues, srt_path)
        thumb_path = None
        try:
            from .media import make_thumbnail
            td = dest_dir.parent / "thumbnails"
            td.mkdir(exist_ok=True)
            thumb_path = str(td / f"{eid[:8]}.jpg")
            make_thumbnail(str(dest), thumb_path, at_s=min(1.0, meta["duration_s"] / 2))
        except FFmpegError:
            thumb_path = None

        return {"id": eid, "path": str(dest), "filename": filename,
                "duration_s": meta["duration_s"], "width": meta["width"],
                "height": meta["height"], "size_bytes": os.path.getsize(dest),
                "label": "enhanced short", "srt_path": srt_path,
                "thumb_path": thumb_path}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def _out_size(aspect: str, resolution: str) -> tuple[int, int]:
    long_edge = 1920 if resolution == "1080p" else 1280
    short_edge = 1080 if resolution == "1080p" else 720
    if aspect == "9:16":
        return short_edge, long_edge
    if aspect == "1:1":
        return short_edge, short_edge
    return long_edge, short_edge


def _pick_encoder(settings):
    from .config import detect_hw_encoder
    if getattr(settings, "prefer_hw_encoder", False):
        hw = detect_hw_encoder()
        if hw:
            return hw, 23
    return "libx264", 21


def _export_id() -> str:
    import uuid
    return str(uuid.uuid4())


def _next_version_hint(exports_dir: Path) -> int:
    return len(list(exports_dir.glob("*.mp4"))) + 1
