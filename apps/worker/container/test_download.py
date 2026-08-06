"""Minimal pure-python checks. Run: python3 test_download.py && python3 test_server.py"""

from __future__ import annotations

import collections
import inspect
import tempfile
from pathlib import Path
from unittest import mock

from download import (
    FORMAT_SELECTOR,
    MAX_CLIP_SECONDS,
    MAX_HEIGHT,
    MIN_CLIP_SECONDS,
    SECTION_PAD_S,
    assert_height_cap,
    build_yt_dlp_base_args,
    crop_clip,
    download_source,
    extract_video_id,
    fetch_video_duration,
    probe_media_duration,
    probe_video_codec,
    probe_video_height,
    validate_clip_range,
)
from progress_map import crop_progress, download_progress, upload_progress


def test_extract_id():
    assert extract_video_id("https://www.youtube.com/watch?v=jNQXAC9IVRw") == "jNQXAC9IVRw"
    assert extract_video_id("https://m.youtube.com/watch?v=jNQXAC9IVRw") == "jNQXAC9IVRw"
    assert extract_video_id("https://youtu.be/jNQXAC9IVRw") == "jNQXAC9IVRw"
    assert extract_video_id("https://www.youtube-nocookie.com/embed/jNQXAC9IVRw") == "jNQXAC9IVRw"
    assert extract_video_id("jNQXAC9IVRw") == "jNQXAC9IVRw"
    assert extract_video_id("https://example.com") is None
    assert extract_video_id("https://evil.com/?u=https://youtube.com/watch?v=jNQXAC9IVRw") is None
    assert extract_video_id("https://notyoutube.com/watch?v=jNQXAC9IVRw") is None


def test_format_cap():
    assert MAX_HEIGHT == 1080
    assert FORMAT_SELECTOR.count("height<=1080") >= 4
    assert "height<=2160" not in FORMAT_SELECTOR
    assert not FORMAT_SELECTOR.rstrip("/").endswith("best")
    assert "bestvideo*" in FORMAT_SELECTOR
    for part in FORMAT_SELECTOR.split("/"):
        assert "height<=1080" in part, part


def test_progress_map_contiguous():
    assert abs(download_progress(0.0) - 0.0) < 1e-9
    assert abs(download_progress(1.0) - 0.55) < 1e-9
    assert abs(download_progress(0.5) - 0.275) < 1e-9
    assert abs(crop_progress(0.0) - 0.55) < 1e-9
    assert abs(crop_progress(1.0) - 0.82) < 1e-9
    assert abs(upload_progress(0.0) - 0.82) < 1e-9
    assert abs(upload_progress(1.0) - 1.0) < 1e-9
    assert download_progress(1.0) == crop_progress(0.0)
    assert crop_progress(1.0) == upload_progress(0.0)
    assert upload_progress(1.0) == 1.0


def test_probe_and_crop_contract():
    src = inspect.getsource(crop_clip)
    assert "libx264" in src
    assert "probe_video_codec" in src
    assert "avc1" in src
    assert "pipe:1" in src
    assert "-threads" in src
    i_pos = src.find('"-i"')
    ss_pos = src.find('"-ss"')
    assert i_pos != -1 and ss_pos != -1 and i_pos < ss_pos
    assert callable(probe_video_codec)
    assert callable(probe_media_duration)
    assert callable(probe_video_height)
    assert callable(fetch_video_duration)
    assert SECTION_PAD_S >= 5
    dl = inspect.getsource(download_source)
    assert "--download-sections" in dl
    assert "--force-keyframes-at-cuts" not in dl
    assert "code != 0" in dl
    assert callable(build_yt_dlp_base_args)


def test_assert_height():
    assert_height_cap(1080)
    assert_height_cap(720)
    try:
        assert_height_cap(1440)
        raise AssertionError("should have raised")
    except ValueError:
        pass
    try:
        assert_height_cap(None)
        raise AssertionError("None height must raise")
    except ValueError:
        pass


def test_validate_clip_range():
    assert validate_clip_range(10.0, 25.0) == 15.0
    for bad in (
        (0.0, 1.0),
        (0.0, MAX_CLIP_SECONDS + 1),
        (10.0, 5.0),
        (float("nan"), 10.0),
        (0.0, float("inf")),
        (-1.0, 10.0),
    ):
        try:
            validate_clip_range(*bad)
            raise AssertionError(f"should reject {bad}")
        except ValueError:
            pass
    assert MIN_CLIP_SECONDS <= 3.0


def test_download_rejects_nonzero_exit_contract():
    src = inspect.getsource(download_source)
    assert "return candidate" not in src
    assert "code != 0" in src


def test_download_source_ignores_partial_on_failure():
    with tempfile.TemporaryDirectory(prefix="clippy-test-") as td:
        out = Path(td) / "src"
        out.mkdir()
        partial = out / "jNQXAC9IVRw.mp4"
        partial.write_bytes(b"x" * 4096)

        with mock.patch(
            "download._run_yt_dlp",
            return_value=(1, None, None, collections.deque(["ERROR: boom"])),
        ):
            try:
                download_source("jNQXAC9IVRw", out, 10.0, 25.0)
                raise AssertionError("should have raised")
            except RuntimeError as exc:
                assert "download_failed" in str(exc)


def test_fetch_video_duration_parses_metadata():
    class FakeProc:
        returncode = 0

        def communicate(self, timeout=None):
            return ("612.0\n", "")

    with mock.patch("download.subprocess.Popen", return_value=FakeProc()):
        assert fetch_video_duration("jNQXAC9IVRw") == 612.0

    class BadProc:
        returncode = 1

        def communicate(self, timeout=None):
            return ("", "err")

    with mock.patch("download.subprocess.Popen", return_value=BadProc()):
        assert fetch_video_duration("jNQXAC9IVRw") is None


if __name__ == "__main__":
    test_extract_id()
    test_format_cap()
    test_progress_map_contiguous()
    test_assert_height()
    test_probe_and_crop_contract()
    test_validate_clip_range()
    test_download_rejects_nonzero_exit_contract()
    test_download_source_ignores_partial_on_failure()
    test_fetch_video_duration_parses_metadata()
    print("ok")
