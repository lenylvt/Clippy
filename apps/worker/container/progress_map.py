"""Map yt-dlp % and pipeline steps to contiguous job progress 0..1."""

from __future__ import annotations

# Contiguous ranges (no gaps): download → crop → upload → 1.0
DOWNLOAD_END = 0.55
CROP_END = 0.82
UPLOAD_END = 1.0


def download_progress(pct: float) -> float:
    """Map yt-dlp 0..1 → overall 0.00..0.55."""
    p = max(0.0, min(1.0, float(pct)))
    if p >= 1.0:
        return DOWNLOAD_END
    return p * DOWNLOAD_END


def crop_progress(phase: float) -> float:
    """phase 0..1 during ffmpeg → overall 0.55..0.82."""
    p = max(0.0, min(1.0, float(phase)))
    if p <= 0.0:
        return DOWNLOAD_END
    if p >= 1.0:
        return CROP_END
    return DOWNLOAD_END + p * (CROP_END - DOWNLOAD_END)


def upload_progress(phase: float) -> float:
    """phase 0..1 during R2 PUT / inline → overall 0.82..1.00."""
    p = max(0.0, min(1.0, float(phase)))
    if p <= 0.0:
        return CROP_END
    if p >= 1.0:
        return UPLOAD_END
    return CROP_END + p * (UPLOAD_END - CROP_END)
