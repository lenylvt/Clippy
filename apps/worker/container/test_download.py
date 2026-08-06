"""Minimal pure-python checks. Run: python3 test_download.py"""

from download import FORMAT_SELECTOR, MAX_HEIGHT, assert_height_cap, extract_video_id
from progress_map import crop_progress, download_progress, upload_progress


def test_extract_id():
    assert extract_video_id("https://www.youtube.com/watch?v=jNQXAC9IVRw") == "jNQXAC9IVRw"
    assert extract_video_id("jNQXAC9IVRw") == "jNQXAC9IVRw"
    assert extract_video_id("https://example.com") is None


def test_format_cap():
    assert MAX_HEIGHT == 1080
    assert "height<=1080" in FORMAT_SELECTOR
    assert "height<=2160" not in FORMAT_SELECTOR
    # Source codec unrestricted — crop always re-encodes to H.264.
    assert "bestvideo*" in FORMAT_SELECTOR


def test_progress_map_ranges():
    assert abs(download_progress(0.0) - 0.08) < 1e-9
    assert abs(download_progress(1.0) - 0.58) < 1e-9
    assert abs(download_progress(0.5) - 0.33) < 1e-9
    assert abs(crop_progress(0.0) - 0.6) < 1e-9
    assert abs(crop_progress(1.0) - 0.82) < 1e-9
    assert abs(upload_progress(0.0) - 0.85) < 1e-9
    assert abs(upload_progress(1.0) - 0.97) < 1e-9
    # Monotonic overall pipeline
    assert download_progress(1.0) < crop_progress(0.0) < upload_progress(0.0) < 1.0


def test_probe_and_crop_contract():
    from download import (
        SECTION_PAD_S,
        crop_clip,
        download_source,
        fetch_video_duration,
        probe_media_duration,
        probe_video_codec,
    )
    import inspect

    src = inspect.getsource(crop_clip)
    assert "libx264" in src
    assert "probe_video_codec" in src
    assert "avc1" in src
    assert "pipe:1" in src
    assert callable(probe_video_codec)
    assert callable(probe_media_duration)
    assert callable(fetch_video_duration)
    assert SECTION_PAD_S > 0
    dl = inspect.getsource(download_source)
    assert "--download-sections" in dl
    assert "--force-keyframes-at-cuts" not in dl


def test_assert_height():
    assert_height_cap(1080)
    assert_height_cap(720)
    try:
        assert_height_cap(1440)
        raise AssertionError("should have raised")
    except ValueError:
        pass


if __name__ == "__main__":
    test_extract_id()
    test_format_cap()
    test_progress_map_ranges()
    test_assert_height()
    test_probe_and_crop_contract()
    print("ok")
