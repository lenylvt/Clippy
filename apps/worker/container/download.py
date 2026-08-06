"""YouTube download helpers — max height 1080p. Always re-encode to H.264 later."""

from __future__ import annotations

import collections
import os
import re
import shutil
import signal
import subprocess
import threading
import time
from pathlib import Path
from typing import Callable
from urllib.parse import parse_qs, urlparse

MAX_HEIGHT = 1080
MIN_CLIP_SECONDS = 3.0
MAX_CLIP_SECONDS = 300.0
# Every branch must cap height — never fall through to uncapped best/bestvideo*.
FORMAT_SELECTOR = (
    "bestvideo*[height<=1080]+bestaudio/"
    "best[height<=1080]/"
    "bestvideo*[height<=1080]/"
    "best[height<=1080]"
)
PLAYER_CLIENTS = os.environ.get(
    "YTDLP_PLAYER_CLIENTS",
    "android_vr,tv,web_safari,android,web",
)
# Pad around the clip so accurate output-seek has keyframe margin.
SECTION_PAD_S = float(os.environ.get("SECTION_PAD_S", "8"))
YTDLP_TIMEOUT_S = int(os.environ.get("YTDLP_TIMEOUT_S", "600"))
FFMPEG_TIMEOUT_S = int(os.environ.get("FFMPEG_TIMEOUT_S", "600"))
FFPROBE_TIMEOUT_S = int(os.environ.get("FFPROBE_TIMEOUT_S", "30"))
YTDLP_FRAGMENTS = max(1, int(os.environ.get("YTDLP_FRAGMENTS", "2")))
FFMPEG_THREADS = max(1, int(os.environ.get("FFMPEG_THREADS", "2")))
FORCE_IPV4 = os.environ.get("YTDLP_FORCE_IPV4", "1") not in {"0", "false", "False"}
LOG_TAIL_MAX = 64
ERR_TAIL_MAX = 32
CLIP_DURATION_TOLERANCE_S = 1.5

YOUTUBE_HOSTS = frozenset(
    {
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "music.youtube.com",
        "youtube-nocookie.com",
        "www.youtube-nocookie.com",
        "youtu.be",
        "www.youtu.be",
    }
)

YOUTUBE_ID_RE = re.compile(
    r"(?:youtu\.be/|youtube(?:-nocookie)?\.com/(?:watch\?v=|shorts/|embed/|live/|v/))"
    r"([A-Za-z0-9_-]{11})"
)
YOUTUBE_ID_ONLY_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
META_PREFIX = "CLIPPY_META\t"


def extract_video_id(url_or_id: str) -> str | None:
    value = (url_or_id or "").strip()
    if not value:
        return None
    if YOUTUBE_ID_ONLY_RE.match(value):
        return value

    # Absolute URLs: require an allowlisted YouTube host before extracting.
    if "://" in value or value.startswith("//"):
        try:
            parsed = urlparse(value if "://" in value else f"https:{value}")
        except ValueError:
            return None
        host = (parsed.hostname or "").lower()
        if host not in YOUTUBE_HOSTS:
            return None
        if host in {"youtu.be", "www.youtu.be"}:
            vid = (parsed.path or "").lstrip("/").split("/")[0]
            return vid if YOUTUBE_ID_ONLY_RE.match(vid) else None
        qs = parse_qs(parsed.query)
        if "v" in qs and qs["v"]:
            candidate = qs["v"][0]
            if YOUTUBE_ID_ONLY_RE.match(candidate):
                return candidate
        match = YOUTUBE_ID_RE.search(value)
        return match.group(1) if match else None

    match = YOUTUBE_ID_RE.search(value)
    return match.group(1) if match else None


def canonical_url(url_or_id: str) -> str:
    video_id = extract_video_id(url_or_id)
    if not video_id:
        raise ValueError("URL YouTube invalide")
    return f"https://www.youtube.com/watch?v={video_id}"


def assert_height_cap(height: int | None, max_height: int = MAX_HEIGHT) -> None:
    if height is None:
        raise ValueError(f"hauteur inconnue (max {max_height})")
    if height > max_height:
        raise ValueError(f"hauteur {height} > max {max_height}")


def validate_clip_range(start: float, end: float) -> float:
    """Return clip duration; raise ValueError if invalid."""
    if not (isinstance(start, (int, float)) and isinstance(end, (int, float))):
        raise ValueError("range invalide")
    if not (_is_finite(start) and _is_finite(end)):
        raise ValueError("range non fini")
    if start < 0 or end < 0:
        raise ValueError("range négatif")
    duration = float(end) - float(start)
    if duration < MIN_CLIP_SECONDS:
        raise ValueError("clip trop court")
    if duration > MAX_CLIP_SECONDS:
        raise ValueError("clip trop long")
    return duration


def _is_finite(value: float) -> bool:
    return value == value and value not in (float("inf"), float("-inf"))


def build_yt_dlp_base_args(
    *,
    player_clients: str = PLAYER_CLIENTS,
    cache_dir: Path | None = None,
) -> list[str]:
    args = [
        "yt-dlp",
        "--no-playlist",
        "--no-update",
        "--newline",
        "-f",
        FORMAT_SELECTOR,
        "-N",
        str(YTDLP_FRAGMENTS),
        "--concurrent-fragments",
        str(YTDLP_FRAGMENTS),
        "--retries",
        "5",
        "--fragment-retries",
        "5",
        "--socket-timeout",
        "30",
        "--merge-output-format",
        "mp4",
        "--extractor-args",
        f"youtube:player_client={player_clients}",
    ]
    if FORCE_IPV4:
        args.append("--force-ipv4")
    if cache_dir is not None:
        args.extend(["--cache-dir", str(cache_dir)])
    else:
        args.append("--no-cache-dir")
    return args


def _tail_error(lines: collections.deque[str] | list[str], limit: int = 16) -> str:
    useful = [
        ln
        for ln in lines
        if ln
        and not ln.startswith("[download]")
        and "Deprecated Feature" not in ln
    ]
    if not useful:
        useful = [ln for ln in lines if ln][-limit:]
    # Prefer ERROR/WARNING lines when present.
    prioritized = [ln for ln in useful if "ERROR" in ln or "error" in ln.lower()]
    pool = prioritized or useful
    return " | ".join(pool[-limit:])[:480]


def _kill_process_group(proc: subprocess.Popen[str]) -> None:
    if proc.poll() is not None:
        return
    try:
        os.killpg(proc.pid, signal.SIGTERM)
    except (ProcessLookupError, PermissionError, OSError):
        try:
            proc.terminate()
        except OSError:
            pass
    try:
        proc.wait(timeout=5)
        return
    except subprocess.TimeoutExpired:
        pass
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError, OSError):
        try:
            proc.kill()
        except OSError:
            pass
    try:
        proc.wait(timeout=2)
    except subprocess.TimeoutExpired:
        pass


def _run_subprocess_lines(
    cmd: list[str],
    *,
    timeout_s: float,
    on_line: Callable[[str], None] | None = None,
    progress_from_line: Callable[[str], float | None] | None = None,
    on_progress: Callable[[float], None] | None = None,
) -> tuple[int, collections.deque[str]]:
    """Run cmd in a new process group; kill the group on timeout."""
    log: collections.deque[str] = collections.deque(maxlen=LOG_TAIL_MAX)
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        start_new_session=True,
    )
    assert proc.stdout is not None
    deadline = time.monotonic() + timeout_s
    last_report = -1.0
    timed_out = False
    try:
        while True:
            if time.monotonic() > deadline:
                timed_out = True
                break
            # Non-blocking-ish: readline blocks; use short poll via select when available.
            line = proc.stdout.readline()
            if line == "" and proc.poll() is not None:
                break
            if not line:
                if proc.poll() is not None:
                    break
                time.sleep(0.05)
                continue
            text = line.rstrip("\n")
            if not text:
                continue
            log.append(text)
            if on_line:
                on_line(text)
            if on_progress and progress_from_line:
                pct = progress_from_line(text)
                if pct is not None and (pct - last_report >= 0.01 or pct >= 0.99):
                    on_progress(min(1.0, pct))
                    last_report = pct
        if timed_out:
            _kill_process_group(proc)
            raise TimeoutError(f"timeout subprocess ({timeout_s:.0f}s): {cmd[0]}")
        code = proc.wait(timeout=5)
        return code, log
    except Exception:
        _kill_process_group(proc)
        raise
    finally:
        if proc.poll() is None:
            _kill_process_group(proc)


def _yt_dlp_progress_from_line(line: str) -> float | None:
    stripped = line.strip()
    if "[download]" not in stripped or "%" not in stripped:
        return None
    match = re.search(r"(\d+(?:\.\d+)?)%", stripped)
    if not match:
        return None
    return float(match.group(1)) / 100.0


def _run_yt_dlp(
    cmd: list[str],
    on_progress: Callable[[float], None] | None,
    *,
    timeout_s: float = YTDLP_TIMEOUT_S,
) -> tuple[int, str | None, int | None, collections.deque[str]]:
    """
    on_progress receives raw yt-dlp fraction 0..1.
    Returns (code, filepath, height, log).
    """
    filepath: str | None = None
    height: int | None = None

    def on_line(text: str) -> None:
        nonlocal filepath, height
        if text.startswith(META_PREFIX):
            parts = text[len(META_PREFIX) :].split("\t")
            if parts:
                filepath = parts[0].strip() or None
            if len(parts) > 1:
                height = _maybe_int(parts[1].strip())

    code, log = _run_subprocess_lines(
        cmd,
        timeout_s=timeout_s,
        on_line=on_line,
        progress_from_line=_yt_dlp_progress_from_line if on_progress else None,
        on_progress=on_progress,
    )
    return code, filepath, height, log


def fetch_video_duration(url_or_id: str) -> float | None:
    """Full video duration via metadata only (no media download)."""
    url = canonical_url(url_or_id)
    cmd = [
        "yt-dlp",
        "--skip-download",
        "--no-playlist",
        "--no-update",
        "--no-warnings",
        "--no-cache-dir",
        "--print",
        "%(duration)s",
        "--extractor-args",
        f"youtube:player_client={PLAYER_CLIENTS}",
        url,
    ]
    if FORCE_IPV4:
        cmd.insert(-1, "--force-ipv4")
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        start_new_session=True,
    )
    try:
        out, _err = proc.communicate(timeout=20)
    except subprocess.TimeoutExpired:
        _kill_process_group(proc)
        return None
    if proc.returncode != 0:
        return None
    raw = (out or "").strip().split("\n")[0].strip()
    try:
        value = float(raw)
    except ValueError:
        return None
    return value if value > 0 and _is_finite(value) else None


def _wipe_dir(path: Path) -> None:
    if not path.exists():
        return
    for child in path.iterdir():
        if child.is_dir():
            shutil.rmtree(child, ignore_errors=True)
        else:
            child.unlink(missing_ok=True)


def download_source(
    url_or_id: str,
    out_dir: Path,
    start: float,
    end: float,
    on_progress: Callable[[float], None] | None = None,
) -> tuple[Path, float]:
    """
    Download only a padded time range of the video.
    Returns (path, offset_in_file) where offset is the clip start inside the file.
    on_progress receives raw yt-dlp fraction 0..1 (monotone across retries).
    """
    validate_clip_range(start, end)

    url = canonical_url(url_or_id)
    out_dir.mkdir(parents=True, exist_ok=True)
    cache_dir = out_dir / ".yt-dlp-cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    out_tmpl = str(out_dir / "%(id)s.%(ext)s")
    video_id = extract_video_id(url_or_id)
    assert video_id

    section_start = max(0.0, float(start) - SECTION_PAD_S)
    section_end = float(end) + SECTION_PAD_S
    offset = float(start) - section_start
    section_arg = f"*{section_start}-{section_end}"

    def make_cmd(player_clients: str) -> list[str]:
        return [
            *build_yt_dlp_base_args(player_clients=player_clients, cache_dir=cache_dir),
            "--download-sections",
            section_arg,
            "-o",
            out_tmpl,
            "--progress",
            "--print",
            f"after_move:{META_PREFIX}%(filepath)s\t%(height)s",
            url,
        ]

    attempts: list[tuple[str, list[str]]] = [
        ("section", make_cmd(PLAYER_CLIENTS)),
        ("section_fallback", make_cmd("default,-android_sdkless")),
    ]

    last_err = "download_failed"
    last_progress = 0.0

    def monotone_progress(pct: float) -> None:
        nonlocal last_progress
        if on_progress is None:
            return
        # Never let UI progress go backwards across retries.
        value = max(last_progress, min(1.0, pct))
        if value > last_progress:
            last_progress = value
            on_progress(value)

    for name, cmd in attempts:
        _wipe_dir(out_dir)
        cache_dir.mkdir(parents=True, exist_ok=True)

        try:
            code, filepath_s, height, log = _run_yt_dlp(cmd, monotone_progress)
        except TimeoutError as exc:
            last_err = f"download_timeout ({name}): {exc}"
            continue

        # Never accept a leftover file when yt-dlp failed.
        if code != 0:
            last_err = f"download_failed ({name}, exit={code}): {_tail_error(log)}"
            _wipe_dir(out_dir)
            cache_dir.mkdir(parents=True, exist_ok=True)
            time.sleep(0.4)
            continue

        if not filepath_s:
            last_err = f"fichier source manquant ({name}, exit={code})"
            continue

        filepath = Path(filepath_s)
        if not filepath.exists() or filepath.stat().st_size <= 1024:
            last_err = f"fichier source vide ({name})"
            continue

        if height is None:
            height = probe_video_height(filepath)
        assert_height_cap(height)
        return filepath, offset

    raise RuntimeError(last_err)


def crop_clip(
    source: Path,
    start: float,
    end: float,
    out_path: Path,
    on_progress: Callable[[float], None] | None = None,
) -> Path:
    duration = end - start
    if duration <= 0 or not _is_finite(duration):
        raise ValueError("durée invalide")

    # Accurate seek: -ss after -i (decode then cut). Section pad supplies keyframe margin.
    reenc_cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(source),
        "-ss",
        str(start),
        "-t",
        str(duration),
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-c:v",
        "libx264",
        "-profile:v",
        "main",
        "-level",
        "4.0",
        "-preset",
        "veryfast",
        "-threads",
        str(FFMPEG_THREADS),
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-tag:v",
        "avc1",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-ac",
        "2",
        "-movflags",
        "+faststart",
        "-progress",
        "pipe:1",
        "-nostats",
        "-loglevel",
        "error",
        str(out_path),
    ]

    err_chunks: collections.deque[str] = collections.deque(maxlen=ERR_TAIL_MAX)
    proc = subprocess.Popen(
        reenc_cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
        start_new_session=True,
    )
    assert proc.stdout is not None
    assert proc.stderr is not None

    def _drain_err() -> None:
        assert proc.stderr is not None
        for line in proc.stderr:
            err_chunks.append(line)

    err_thread = threading.Thread(target=_drain_err, daemon=True)
    err_thread.start()

    last_report = -1.0
    if on_progress:
        on_progress(0.0)

    deadline = time.monotonic() + FFMPEG_TIMEOUT_S
    timed_out = False
    try:
        while True:
            if time.monotonic() > deadline:
                timed_out = True
                break
            line_raw = proc.stdout.readline()
            if line_raw == "" and proc.poll() is not None:
                break
            if not line_raw:
                if proc.poll() is not None:
                    break
                time.sleep(0.05)
                continue
            line = line_raw.strip()
            if not line:
                continue
            if on_progress and line.startswith("out_time_ms="):
                raw_ms = line.split("=", 1)[1].strip()
                if raw_ms in {"N/A", "NA", ""}:
                    continue
                try:
                    ms = int(raw_ms)
                except ValueError:
                    continue
                if ms < 0:
                    continue
                phase = min(1.0, max(0.0, (ms / 1000.0) / duration))
                if phase - last_report >= 0.02 or phase >= 0.99:
                    on_progress(phase)
                    last_report = phase
            elif line.startswith("out_time=") and on_progress:
                # Fallback parser if out_time_ms missing.
                pass
            elif line == "progress=end" and on_progress:
                on_progress(1.0)

        if timed_out:
            _kill_process_group(proc)
            raise TimeoutError(f"timeout ffmpeg ({FFMPEG_TIMEOUT_S}s)")

        code = proc.wait(timeout=5)
    except Exception:
        _kill_process_group(proc)
        raise
    finally:
        if proc.poll() is None:
            _kill_process_group(proc)
        err_thread.join(timeout=5)

    err_text = "".join(err_chunks).strip()

    if code != 0 or not out_path.exists() or out_path.stat().st_size < 1024:
        raise RuntimeError(err_text[-400:] or "ffmpeg_failed")

    codec = probe_video_codec(out_path)
    if codec not in {"h264", "avc1"}:
        raise RuntimeError(f"codec_incompatible:{codec or 'unknown'}")

    actual = probe_media_duration(out_path)
    if actual is not None and abs(actual - duration) > max(CLIP_DURATION_TOLERANCE_S, duration * 0.25):
        raise RuntimeError(
            f"durée clip incohérente: got={actual:.2f}s expected≈{duration:.2f}s"
        )

    # Soft signal if audio stream missing (still valid for Photos).
    if probe_has_audio(out_path) is False:
        print("[dl] warning: clip sans piste audio")

    return out_path


def probe_media_duration(path: Path) -> float | None:
    """Return media duration in seconds (source or clip)."""
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "csv=p=0",
        str(path),
    ]
    return _ffprobe_float(cmd)


def probe_video_codec(path: Path) -> str | None:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=codec_name",
        "-of",
        "csv=p=0",
        str(path),
    ]
    return _ffprobe_str(cmd)


def probe_video_height(path: Path) -> int | None:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=height",
        "-of",
        "csv=p=0",
        str(path),
    ]
    raw = _ffprobe_str(cmd)
    return _maybe_int(raw)


def probe_has_audio(path: Path) -> bool | None:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "a:0",
        "-show_entries",
        "stream=codec_name",
        "-of",
        "csv=p=0",
        str(path),
    ]
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=False,
            timeout=FFPROBE_TIMEOUT_S,
            start_new_session=True,
        )
    except subprocess.TimeoutExpired:
        return None
    if result.returncode != 0:
        return None
    return bool((result.stdout or "").strip())


def _ffprobe_str(cmd: list[str]) -> str | None:
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=False,
            timeout=FFPROBE_TIMEOUT_S,
            start_new_session=True,
        )
    except subprocess.TimeoutExpired:
        return None
    if result.returncode != 0:
        return None
    return (result.stdout or "").strip().split("\n")[0].strip() or None


def _ffprobe_float(cmd: list[str]) -> float | None:
    raw = _ffprobe_str(cmd)
    if raw is None or raw in {"N/A", "NA"}:
        return None
    try:
        value = float(raw)
    except ValueError:
        return None
    return value if value > 0 and _is_finite(value) else None


def _maybe_int(value: str | None) -> int | None:
    if value is None or value in ("", "NA", "None", "N/A"):
        return None
    try:
        return int(float(value))
    except ValueError:
        return None
