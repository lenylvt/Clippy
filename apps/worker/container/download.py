"""YouTube download helpers — max height 1080p. Always re-encode to H.264 later."""

from __future__ import annotations

import re
import subprocess
import threading
from pathlib import Path
from typing import Callable

MAX_HEIGHT = 1080
# Any codec is fine: crop_clip always re-encodes to libx264 for iOS Photos.
FORMAT_SELECTOR = (
    "bestvideo*[height<=1080]+bestaudio/"
    "best[height<=1080]/"
    "bestvideo*+bestaudio/"
    "best"
)
# Prefer clients that currently work without PO Token when possible.
PLAYER_CLIENTS = "android_vr,tv,web_safari,android,web"
# Pad around the clip so ffmpeg can seek accurately after section download.
SECTION_PAD_S = 2.0

YOUTUBE_ID_RE = re.compile(
    r"(?:youtu\.be/|youtube\.com/(?:watch\?v=|shorts/|embed/|live/)|youtube\.com/v/)([A-Za-z0-9_-]{11})"
)
YOUTUBE_ID_ONLY_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")


def extract_video_id(url_or_id: str) -> str | None:
    value = (url_or_id or "").strip()
    if not value:
        return None
    if YOUTUBE_ID_ONLY_RE.match(value):
        return value
    match = YOUTUBE_ID_RE.search(value)
    return match.group(1) if match else None


def canonical_url(url_or_id: str) -> str:
    video_id = extract_video_id(url_or_id)
    if not video_id:
        raise ValueError("URL YouTube invalide")
    return f"https://www.youtube.com/watch?v={video_id}"


def assert_height_cap(height: int | None, max_height: int = MAX_HEIGHT) -> None:
    if height is not None and height > max_height:
        raise ValueError(f"hauteur {height} > max {max_height}")


def build_yt_dlp_base_args(*, player_clients: str = PLAYER_CLIENTS) -> list[str]:
    return [
        "yt-dlp",
        "--no-playlist",
        "--no-update",
        "--newline",
        "-f",
        FORMAT_SELECTOR,
        "-N",
        "4",
        "--concurrent-fragments",
        "4",
        "--retries",
        "5",
        "--fragment-retries",
        "5",
        "--socket-timeout",
        "30",
        "--force-ipv4",
        "--merge-output-format",
        "mp4",
        "--extractor-args",
        f"youtube:player_client={player_clients}",
    ]


def _tail_error(lines: list[str], limit: int = 16) -> str:
    useful = [
        ln
        for ln in lines
        if ln
        and not ln.startswith("[download]")
        and "Deprecated Feature" not in ln
    ]
    if not useful:
        useful = [ln for ln in lines if ln][-limit:]
    return " | ".join(useful[-limit:])[:480]


def _run_yt_dlp(
    cmd: list[str],
    on_progress: Callable[[float], None] | None,
) -> tuple[int, list[str], list[str]]:
    """on_progress receives raw yt-dlp fraction 0..1."""
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    assert proc.stdout is not None
    printed: list[str] = []
    log: list[str] = []
    last_report = -1.0
    for raw in proc.stdout:
        line = raw.rstrip("\n")
        if not line:
            continue
        log.append(line)
        stripped = line.strip()
        if on_progress and "[download]" in stripped and "%" in stripped:
            match = re.search(r"(\d+(?:\.\d+)?)%", stripped)
            if match:
                pct = float(match.group(1)) / 100.0
                # Emit every ~1% for precise UI updates.
                if pct - last_report >= 0.01 or pct >= 0.99:
                    on_progress(min(1.0, pct))
                    last_report = pct
        if not stripped.startswith("["):
            printed.append(stripped)
    code = proc.wait()
    return code, printed, log


def fetch_video_duration(url_or_id: str) -> float | None:
    """Full video duration via metadata only (no media download)."""
    url = canonical_url(url_or_id)
    cmd = [
        "yt-dlp",
        "--skip-download",
        "--no-playlist",
        "--no-update",
        "--no-warnings",
        "--print",
        "%(duration)s",
        "--extractor-args",
        f"youtube:player_client={PLAYER_CLIENTS}",
        url,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=False, timeout=60)
    if result.returncode != 0:
        return None
    raw = (result.stdout or "").strip().split("\n")[0].strip()
    try:
        value = float(raw)
    except ValueError:
        return None
    return value if value > 0 else None


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
    on_progress receives raw yt-dlp fraction 0..1.
    """
    if end <= start:
        raise ValueError("durée invalide")

    url = canonical_url(url_or_id)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_tmpl = str(out_dir / "%(id)s.%(ext)s")
    video_id = extract_video_id(url_or_id)
    assert video_id

    section_start = max(0.0, float(start) - SECTION_PAD_S)
    section_end = float(end) + SECTION_PAD_S
    # Position of the real clip start inside the downloaded section file.
    offset = float(start) - section_start
    section_arg = f"*{section_start}-{section_end}"

    def make_cmd(player_clients: str) -> list[str]:
        return [
            *build_yt_dlp_base_args(player_clients=player_clients),
            "--download-sections",
            section_arg,
            "-o",
            out_tmpl,
            "--progress",
            "--print",
            "after_move:filepath",
            "--print",
            "after_move:height",
            url,
        ]

    attempts: list[tuple[str, list[str]]] = [
        ("section", make_cmd(PLAYER_CLIENTS)),
        ("section_fallback", make_cmd("default,-android_sdkless")),
    ]

    last_err = "download yt-dlp échoué"
    for name, cmd in attempts:
        for leftover in out_dir.glob(f"{video_id}.*"):
            leftover.unlink(missing_ok=True)

        code, printed, log = _run_yt_dlp(cmd, on_progress)
        if code == 0 and printed:
            filepath = Path(printed[0])
            height = _maybe_int(printed[1] if len(printed) > 1 else None)
            assert_height_cap(height)
            if filepath.exists() and filepath.stat().st_size > 1024:
                return filepath, offset
            last_err = f"fichier source manquant ({name}, exit={code})"
            continue

        last_err = f"download yt-dlp échoué ({name}, exit={code}): {_tail_error(log)}"
        matches = sorted(out_dir.glob(f"{video_id}.*"), key=lambda p: p.stat().st_mtime, reverse=True)
        for candidate in matches:
            if candidate.suffix.lower() in {".mp4", ".mkv", ".webm"} and candidate.stat().st_size > 1024:
                return candidate, offset

    raise RuntimeError(last_err)


def crop_clip(
    source: Path,
    start: float,
    end: float,
    out_path: Path,
    on_progress: Callable[[float], None] | None = None,
) -> Path:
    duration = end - start
    if duration <= 0:
        raise ValueError("durée invalide")

    # Always re-encode to H.264/AAC. Stream-copy keeps AV1/VP9 which iOS Photos rejects.
    reenc_cmd = [
        "ffmpeg",
        "-y",
        "-ss",
        str(start),
        "-i",
        str(source),
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

    proc = subprocess.Popen(
        reenc_cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
    )
    assert proc.stdout is not None
    assert proc.stderr is not None

    err_chunks: list[str] = []

    def _drain_err() -> None:
        assert proc.stderr is not None
        for line in proc.stderr:
            err_chunks.append(line)

    err_thread = threading.Thread(target=_drain_err, daemon=True)
    err_thread.start()

    last_report = -1.0
    if on_progress:
        on_progress(0.0)

    for raw in proc.stdout:
        line = raw.strip()
        if not line:
            continue
        if on_progress and line.startswith("out_time_ms="):
            try:
                ms = int(line.split("=", 1)[1].strip())
            except ValueError:
                continue
            phase = min(1.0, max(0.0, (ms / 1000.0) / duration))
            if phase - last_report >= 0.02 or phase >= 0.99:
                on_progress(phase)
                last_report = phase
        elif line == "progress=end" and on_progress:
            on_progress(1.0)

    code = proc.wait()
    err_thread.join(timeout=5)
    err_text = "".join(err_chunks).strip()

    if code != 0 or not out_path.exists() or out_path.stat().st_size < 1024:
        raise RuntimeError(err_text[-400:] or "ffmpeg crop échoué")

    codec = probe_video_codec(out_path)
    if codec not in {"h264", "avc1"}:
        raise RuntimeError(f"codec incompatible Photos iOS: {codec or 'unknown'} (attendu h264)")
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
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        return None
    raw = (result.stdout or "").strip().split("\n")[0].strip()
    if not raw or raw in {"N/A", "NA"}:
        return None
    try:
        value = float(raw)
    except ValueError:
        return None
    return value if value > 0 else None


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
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        return None
    return (result.stdout or "").strip().split("\n")[0].strip() or None


def _maybe_int(value: str | None) -> int | None:
    if value is None or value in ("", "NA", "None"):
        return None
    try:
        return int(float(value))
    except ValueError:
        return None
