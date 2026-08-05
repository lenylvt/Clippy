"""Minimal pure-python checks. Run: python3 test_download.py"""

from download import FORMAT_SELECTOR, MAX_HEIGHT, assert_height_cap, extract_video_id


def test_extract_id():
    assert extract_video_id("https://www.youtube.com/watch?v=jNQXAC9IVRw") == "jNQXAC9IVRw"
    assert extract_video_id("jNQXAC9IVRw") == "jNQXAC9IVRw"
    assert extract_video_id("https://example.com") is None


def test_format_cap():
    assert MAX_HEIGHT == 1080
    assert "height<=1080" in FORMAT_SELECTOR
    assert "height<=2160" not in FORMAT_SELECTOR


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
    test_assert_height()
    print("ok")
