"""FFmpeg / ffprobe wrapper: real media work, safe argument arrays, progress, cancellation."""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import threading
from pathlib import Path
from typing import Callable, Optional

from .config import which


class FFmpegError(RuntimeError):
    pass


def _bin(name: str) -> str:
    p = which(name)
    if not p:
        raise FFmpegError(f"{name} not found on PATH. Install FFmpeg and retry.")
    return p


# ---------------------------------------------------------------------------
# Probing
# ---------------------------------------------------------------------------

def ffprobe(path: str | Path) -> dict:
    """Return parsed ffprobe JSON. Raises FFmpegError for non-media files."""
    out = subprocess.run(
        [_bin("ffprobe"), "-v", "error", "-print_format", "json",
         "-show_format", "-show_streams", str(path)],
        capture_output=True, text=True, timeout=60)
    if out.returncode != 0:
        raise FFmpegError(f"ffprobe failed (not a valid media file?): {out.stderr.strip()[:300]}")
    try:
        data = json.loads(out.stdout or "{}")
    except json.JSONDecodeError as e:
        raise FFmpegError(f"ffprobe output unparseable: {e}")
    if not data.get("streams"):
        raise FFmpegError("file contains no decodable streams")
    return data


def summarize_probe(probe: dict) -> dict:
    fmt = probe.get("format", {})
    v = next((s for s in probe["streams"] if s.get("codec_type") == "video"), None)
    a = next((s for s in probe["streams"] if s.get("codec_type") == "audio"), None)
    duration = float(fmt.get("duration") or (v or {}).get("duration") or 0)
    rotation = 0
    if v:
        for sd in v.get("side_data_list", []) or []:
            if "rotation" in sd:
                try:
                    rotation = int(abs(float(sd["rotation"]))) % 360
                except (ValueError, TypeError):
                    pass
        rot_meta = (v.get("tags") or {}).get("rotate")
        if rot_meta:
            try:
                rotation = int(rot_meta) % 360
            except ValueError:
                pass
    fps = 30.0
    if v:
        fr = v.get("avg_frame_rate") or v.get("r_frame_rate") or "30/1"
        try:
            num, _, den = fr.partition("/")
            fps = float(num) / float(den or 1)
            if fps <= 0 or fps > 240:
                fps = 30.0
        except (ValueError, ZeroDivisionError):
            fps = 30.0
    w, h = (v or {}).get("width", 0), (v or {}).get("height", 0)
    if rotation in (90, 270):
        w, h = h, w
    return {
        "duration_s": round(duration, 3),
        "size_bytes": int(fmt.get("size") or 0),
        "width": w, "height": h, "fps": round(fps, 2), "rotation": rotation,
        "video_codec": (v or {}).get("codec_name"),
        "audio_codec": (a or {}).get("codec_name"),
        "has_video": v is not None, "has_audio": a is not None,
        "bit_rate": int(fmt.get("bit_rate") or 0),
        "format_name": fmt.get("format_name", ""),
    }


def classify_kind(meta: dict) -> str:
    """'short' if already vertical-ish and <3min; 'long' otherwise."""
    d = meta.get("duration_s") or 0
    w, h = meta.get("width") or 0, meta.get("height") or 0
    vertical = h >= w and w > 0
    if d and d <= 180 and vertical:
        return "short"
    return "long"


# ---------------------------------------------------------------------------
# Rendering primitives
# ---------------------------------------------------------------------------

def run_ffmpeg(args: list[str], timeout: int = 3600,
               on_line: Optional[Callable[[str], None]] = None,
               cancel_event: Optional[threading.Event] = None) -> str:
    """Run ffmpeg with an argument array (never shell). Returns stderr tail."""
    proc = subprocess.Popen([_bin("ffmpeg"), "-hide_banner", "-y", *args],
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True, bufsize=1)
    tail: list[str] = []
    assert proc.stdout is not None
    try:
        for line in proc.stdout:
            tail.append(line.rstrip())
            if len(tail) > 200:
                tail.pop(0)
            if on_line:
                on_line(line.rstrip())
            if cancel_event is not None and cancel_event.is_set():
                proc.kill()
                raise FFmpegError("cancelled")
        rc = proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        proc.kill()
        raise FFmpegError(f"ffmpeg timed out after {timeout}s")
    finally:
        try:
            proc.stdout.close()
        except Exception:
            pass
    if proc.returncode not in (0, None):
        raise FFmpegError("ffmpeg exited with code %d:\n%s"
                          % (proc.returncode, "\n".join(tail[-25:])))
    return "\n".join(tail[-25:])


def extract_clip(src: str, start: float, end: float, dst: str,
                 vf: Optional[str] = None, af: Optional[str] = None,
                 fps: int = 30, threads: int = 0,
                 encoder: str = "libx264", crf: int = 21,
                 preset: str = "veryfast",
                 cancel_event: Optional[threading.Event] = None,
                 on_progress: Optional[Callable[[float], None]] = None) -> None:
    """Trim [start,end] from src, apply video/audio filters, encode to dst (mp4)."""
    dur = max(0.1, end - start)
    args = ["-ss", f"{start:.3f}", "-t", f"{dur:.3f}", "-i", src]
    if vf:
        args += ["-vf", vf]
    else:
        args += ["-c:v", "copy"] if not af else ["-an"]
    if af:
        args += ["-af", af]
    if not vf:
        args += ["-c:v", "copy"]
    args += ["-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2",
             "-r", str(fps), "-pix_fmt", "yuv420p", "-movflags", "+faststart"]
    if vf:
        args += ["-c:v", encoder]
        if encoder == "libx264":
            args += ["-preset", preset, "-crf", str(crf)]
        else:
            args += ["-b:v", "8M"]
    if threads:
        args += ["-threads", str(threads)]
    args.append(dst)

    def _line(l: str):
        if on_progress:
            m = re.search(r"time=(\d+):(\d+):(\d+(?:\.\d+)?)", l)
            if m:
                h, mi, s = int(m.group(1)), int(m.group(2)), float(m.group(3))
                on_progress(min(1.0, (h * 3600 + mi * 60 + s) / dur))

    run_ffmpeg(args, timeout=max(120, int(dur * 60) + 120),
               on_line=_line, cancel_event=cancel_event)


def concat_clips(parts: list[str], dst: str, has_audio: bool = True,
                 cancel_event: Optional[threading.Event] = None) -> None:
    """Concatenate identically-encoded mp4 segments via the concat demuxer."""
    lst = dst + ".concat.txt"
    with open(lst, "w", encoding="utf-8") as f:
        for p in parts:
            f.write("file '%s'\n" % os.path.abspath(p).replace("'", "'\\''"))
    args = ["-f", "concat", "-safe", "0", "-i", lst, "-c", "copy",
            "-movflags", "+faststart", dst]
    try:
        run_ffmpeg(args, timeout=600, cancel_event=cancel_event)
    finally:
        try:
            os.remove(lst)
        except OSError:
            pass


def crossfade_concat(parts: list[str], dst: str, fade_s: float, w: int, h: int,
                     fps: int, audio: bool, threads: int,
                     cancel_event: Optional[threading.Event] = None) -> None:
    """xfade (+ acrossfade when audio) between segments — used only when transitions enabled."""
    ins: list[str] = []
    for p in parts:
        ins += ["-i", p]
    n = len(parts)
    fc: list[str] = []
    # build chained xfade
    prev = "[0:v]"
    acc_dur = None
    for i in range(1, n):
        offset = (acc_dur if acc_dur is not None else _probe_dur(parts[0])) - fade_s
        out = f"[vx{i}]"
        fc.append(f"{prev}[{i}:v]xfade=transition=fade:duration={fade_s:.3f}:offset={offset:.3f}{out}")
        prev = out
        acc_dur = offset + (_probe_dur(parts[i]) - fade_s)
    fc.append(f"{prev}null[vout]")
    if audio and all(_has_audio(p) for p in parts):
        aprev = "[0:a]"
        for i in range(1, n):
            aout = f"[ax{i}]"
            fc.append(f"{aprev}[{i}:a]acrossfade=d={fade_s:.3f}{aout}")
            aprev = aout
        fc.append(f"{aprev}anull[aout]")
        amap = ["-map", "[aout]", "-c:a", "aac", "-b:a", "160k"]
    else:
        amap = ["-an"]
    args = [*ins, "-filter_complex", ";".join(fc), "-map", "[vout]", *amap,
            "-r", str(fps), "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart"]
    if threads:
        args += ["-threads", str(threads)]
    args.append(dst)
    run_ffmpeg(args, timeout=3600, cancel_event=cancel_event)


def _probe_dur(p: str) -> float:
    out = subprocess.run([_bin("ffprobe"), "-v", "error", "-show_entries",
                          "format=duration", "-of", "csv=p=0", p],
                         capture_output=True, text=True, timeout=30)
    try:
        return float(out.stdout.strip())
    except ValueError:
        return 0.0


def _has_audio(p: str) -> bool:
    out = subprocess.run([_bin("ffprobe"), "-v", "error", "-select_streams", "a",
                          "-show_entries", "stream=codec_type", "-of", "csv=p=0", p],
                         capture_output=True, text=True, timeout=30)
    return "audio" in out.stdout


def make_thumbnail(video: str, dst: str, at_s: float = 1.0, size: int = 480,
                   cancel_event: Optional[threading.Event] = None) -> None:
    run_ffmpeg(["-ss", f"{at_s:.2f}", "-i", video, "-frames:v", "1",
                "-vf", f"scale=-2:{size}", dst], timeout=120, cancel_event=cancel_event)


def verify_output(path: str | Path, expect_audio: bool) -> dict:
    """Full decode check + stream validation. Raises FFmpegError if invalid."""
    p = str(path)
    probe = ffprobe(p)
    meta = summarize_probe(probe)
    if not meta["has_video"]:
        raise FFmpegError("output verification failed: no video stream")
    if expect_audio and not meta["has_audio"]:
        raise FFmpegError("output verification failed: expected audio stream missing")
    # Decode every frame to /dev/null to prove streams actually decode.
    devnull = "NUL" if os.name == "nt" else "/dev/null"
    run_ffmpeg(["-v", "error", "-i", p, "-f", "null", devnull], timeout=1800)
    if os.path.getsize(p) < 1024:
        raise FFmpegError("output verification failed: file suspiciously small")
    return meta


# ---------------------------------------------------------------------------
# Filter construction helpers (allowlisted parameters only)
# ---------------------------------------------------------------------------

def ass_time(seconds: float) -> str:
    ms = int(round(max(0.0, seconds) * 1000))
    h, rem = divmod(ms, 3600000)
    m, rem = divmod(rem, 60000)
    s, ms = divmod(rem, 1000)
    return f"{h}:{m:02d}:{s:02d}.{ms//10}"


def write_ass(cues, path: str, font_size: int, color: str, outline_color: str,
              position: str, word_highlight: bool, play_w: int, play_h: int) -> None:
    """Write an SSA subtitle file. Colors are '#rrggbb' validated upstream."""
    def ssacol(hexcol: str) -> str:
        h = hexcol.lstrip("#")
        return f"&H00{h[4:6]}{h[2:4]}{h[0:2]}".upper()

    align = {"bottom": 2, "middle": 5, "top": 8}.get(position, 2)
    margin_v = 60 if position == "bottom" else (0 if position == "middle" else 60)
    header = f"""[Script Info]
ScriptType: v4.0+
PlayResX: {play_w}
PlayResY: {play_h}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,DejaVu Sans,{font_size},{ssacol(color)},{ssacol("#FFD400")},{ssacol(outline_color)},&H80000000,-1,0,0,0,100,100,0,0,1,3,1,{align},40,40,{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = [header]
    for c in cues:
        text = (c.text.replace("\n", " ").replace("{", "(").replace("}", ")"))
        if word_highlight:
            words = text.split()
            n = max(1, len(words))
            span = (c.end_s - c.start_s) / n
            parts = []
            for i, wtok in enumerate(words):
                ws = c.start_s + i * span
                we = min(c.end_s, ws + span)
                parts.append(f"{{\\kf{(we - ws) * 100:.0f}}}{wtok} ")
            text = "".join(parts).strip()
        lines.append(f"Dialogue: 0,{ass_time(c.start_s)},{ass_time(c.end_s)},Cap,,0,0,0,,{text}\n")
    with open(path, "w", encoding="utf-8") as f:
        f.writelines(lines)


def srt_from_cues(cues, path: str) -> None:
    def srt_t(sec: float) -> str:
        ms = int(round(max(0.0, sec) * 1000))
        h, rem = divmod(ms, 3600000)
        m, rem = divmod(rem, 60000)
        s, ms = divmod(rem, 1000)
        return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
    with open(path, "w", encoding="utf-8") as f:
        for i, c in enumerate(cues, 1):
            f.write(f"{i}\n{srt_t(c.start_s)} --> {srt_t(c.end_s)}\n{c.text}\n\n")


def build_reframe_vf(in_w: int, in_h: int, out_w: int, out_h: int, mode: str,
                     x_frac: float, y_frac: float) -> str:
    """Scale+crop source into target aspect. Pure arithmetic, clamped fractions."""
    x_frac = min(max(x_frac, 0.0), 1.0)
    y_frac = min(max(y_frac, 0.0), 1.0)
    in_ar = in_w / max(1, in_h)
    out_ar = out_w / out_h
    if in_ar > out_ar:      # too wide -> crop width
        new_w = int(in_h * out_ar) // 2 * 2
        x = int((in_w - new_w) * x_frac) // 2 * 2
        return (f"scale={out_w}:{out_h}:force_original_aspect_ratio=increase,"
                f"crop={out_w}:{out_h}")
    if in_ar < out_ar:      # too tall -> crop height
        return (f"scale={out_w}:{out_h}:force_original_aspect_ratio=increase,"
                f"crop={out_w}:{out_h}")
    return f"scale={out_w}:{out_h}"


def _num(v: float) -> str:
    """Format a float for embedding in an ffmpeg expression (safe charset only)."""
    s = f"{float(v):.4f}".rstrip("0").rstrip(".")
    return s if s and s != "-0" else "0"


def apply_zoom_filter(out_w: int, out_h: int, zooms) -> Optional[str]:
    """Dynamic-crop punch-in zoom stage appended AFTER final scaling.

    Produces one crop filter whose w/h/x/y are frame-evaluated expressions:
    during each zoom window the crop shrinks toward (x_frac, y_frac) with a
    0.4s ease in/out ramp, then scales back to output size. All numbers are
    backend-generated; no user/model strings enter the expression.
    """
    zs = [z for z in zooms if 1.0 < z.scale <= 1.4 and z.end_s > z.start_s]
    if not zs:
        return None

    def ramp(z) -> str:
        # ease-in over 0.4s after start, ease-out over 0.4s before end
        half = (z.scale - 1.0) / 2.0
        return (f"{_num(half)}*max(0,min(1,(T-{_num(z.start_s)})/0.4))"
                f"*max(0,min(1,({_num(z.end_s)}-T)/0.4))")

    total_ramp = "+".join(f"min({ramp(z)},if(gt(T,{_num(z.start_s)})"
                          f"*lt(T,{_num(z.end_s)}),1,0))" for z in zs)
    # Weighted center across active zoom windows
    centers_x, centers_y, weights = [], [], []
    for z in zs:
        w = (f"if(gt(T,{_num(z.start_s)})*lt(T,{_num(z.end_s)}),1,0)")
        weights.append(w)
        centers_x.append(f"{_num(min(max(z.x_frac, 0.0), 1.0))}*({w})")
        centers_y.append(f"{_num(min(max(z.y_frac, 0.0), 1.0))}*({w})")
    wsum = "+".join(weights)
    cx = f"({'+'.join(centers_x)})/max(1,({wsum}))"
    cy = f"({'+'.join(centers_y)})/max(1,({wsum}))"

    ww = f"trunc(iw/(1+({total_ramp}))/2)*2"
    hh = f"trunc(ih/(1+({total_ramp}))/2)*2"
    xx = f"trunc((iw-({ww}))*({cx}))"
    yy = f"trunc((ih-({hh}))*({cy}))"
    crop = (f"crop='{ww}':'{hh}':'max(0,min(iw-{ww},{xx}))'"
            f":'max(0,min(ih-{hh},{yy}))':eval=frame")
    return f"{crop},scale={out_w}:{out_h}"


def audio_filter_chain(normalize: bool, target_lufs: float, fade_in: float,
                       fade_out: float, total_dur: float) -> Optional[str]:
    parts = []
    if normalize:
        parts.append(f"loudnorm=I={target_lufs:.1f}:TP=-1.5:LRA=11")
    if fade_in > 0:
        parts.append(f"afade=t=in:d={fade_in:.2f}")
    if fade_out > 0 and total_dur > fade_out:
        parts.append(f"afade=t=out:st={max(0, total_dur - fade_out):.2f}:d={fade_out:.2f}")
    return ",".join(parts) if parts else None
