"""Map yt-dlp % and pipeline steps to precise job progress."""

from __future__ import annotations


def download_progress(pct: float) -> float:
    """Map yt-dlp 0..1 → overall 0.08..0.58."""
    p = max(0.0, min(1.0, float(pct)))
    return 0.08 + p * 0.5


def crop_progress(phase: float) -> float:
    """phase 0..1 during ffmpeg → overall 0.60..0.82."""
    p = max(0.0, min(1.0, float(phase)))
    return 0.6 + p * 0.22


def upload_progress(phase: float) -> float:
    """phase 0..1 during R2 PUT → overall 0.85..0.97."""
    p = max(0.0, min(1.0, float(phase)))
    return 0.85 + p * 0.12
