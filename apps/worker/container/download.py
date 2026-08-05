"""YouTube download helpers — max height 1080p, optimized for speed."""

from __future__ import annotations

import json
import re
import subprocess
import time
from pathlib import Path
from typing import Any

MAX_HEIGHT = 1080
FORMAT_SELECTOR = (
    "bestvideo*[height<=1080][ext=mp4]+bestaudio[ext=m4a]/"
    "bestvideo*[height<=1080]+bestaudio/"
    "best[height<=1080]/"
    "bestvideo*[height<=720]+bestaudio/"
    "best[height<=720]"
)

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


def build_yt_dlp_base_args() -> list[str]:
    return [
        "yt-dlp",
        "--no-playlist",
        "--no-warnings",
        "--newline",
        "-f",
        FORMAT_SELECTOR,
        "-N",
        "16",
        "--concurrent-fragments",
        "16",
        "--retries",
        "5",
        "--fragment-retries",
        "5",
        "--socket-timeout",
        "20",
        "--force-ipv4",
        "--prefer-ffmpeg",
        "--merge-output-format",
        "mp4",
    ]


def download_source(url_or_id: str, out_dir: Path) -> Path:
    url = canonical_url(url_or_id)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_tmpl = str(out_dir / "%(id)s.%(ext)s")
    video_id = extract_video_id(url_or_id)
    assert video_id

    cmd = [
        *build_yt_dlp_base_args(),
        "-o",
        out_tmpl,
        "--print",
        "after_move:filepath",
        "--print",
        "after_move:height",
        url,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "download yt-dlp échoué")

    lines = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    if not lines:
        raise RuntimeError("yt-dlp n'a pas renvoyé de chemin")
    filepath = Path(lines[0])
    height = _maybe_int(lines[1] if len(lines) > 1 else None)
    assert_height_cap(height)
    if not filepath.exists():
        raise RuntimeError("fichier source manquant")
    return filepath


def crop_clip(source: Path, start: float, end: float, out_path: Path) -> Path:
    duration = end - start
    if duration <= 0:
        raise ValueError("durée invalide")

    # Fast path: stream copy
    copy_cmd = [
        "ffmpeg",
        "-y",
        "-ss",
        str(start),
        "-i",
        str(source),
        "-t",
        str(duration),
        "-c",
        "copy",
        "-avoid_negative_ts",
        "make_zero",
        "-movflags",
        "+faststart",
        str(out_path),
    ]
    copy = subprocess.run(copy_cmd, capture_output=True, text=True, check=False)
    if copy.returncode == 0 and out_path.exists() and out_path.stat().st_size > 1024:
        return out_path

    # Fallback re-encode
    reenc_cmd = [
        "ffmpeg",
        "-y",
        "-ss",
        str(start),
        "-i",
        str(source),
        "-t",
        str(duration),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        str(out_path),
    ]
    reenc = subprocess.run(reenc_cmd, capture_output=True, text=True, check=False)
    if reenc.returncode != 0 or not out_path.exists() or out_path.stat().st_size < 1024:
        raise RuntimeError(reenc.stderr.strip() or "ffmpeg crop échoué")
    return out_path


def _maybe_int(value: str | None) -> int | None:
    if value is None or value in ("", "NA", "None"):
        return None
    try:
        return int(float(value))
    except ValueError:
        return None


def process_clip(url: str, start: float, end: float, work_dir: Path) -> dict[str, Any]:
    started = time.perf_counter()
    source = download_source(url, work_dir / "src")
    download_ms = round((time.perf_counter() - started) * 1000)

    crop_started = time.perf_counter()
    out_path = work_dir / "clip.mp4"
    crop_clip(source, start, end, out_path)
    crop_ms = round((time.perf_counter() - crop_started) * 1000)

    return {
        "filepath": out_path,
        "bytes": out_path.stat().st_size,
        "download_ms": download_ms,
        "crop_ms": crop_ms,
        "total_ms": round((time.perf_counter() - started) * 1000),
    }
