"""Unit tests for server auth / SSRF / body limits. Run: python3 test_server.py"""

from __future__ import annotations

import inspect
import os
from unittest import mock

from server import (
    check_internal_auth,
    is_allowed_r2_upload_url,
    parse_content_length,
    public_error,
    sanitize_job_id,
    validate_r2_key,
)
import server as server_mod


def test_sanitize_job_id():
    assert sanitize_job_id("job_abc-123") == "job_abc-123"
    assert sanitize_job_id("") == "unknown"
    assert sanitize_job_id("a" * 200) == "unknown"
    assert sanitize_job_id("evil\r\nX-Injected: 1") == "unknown"
    assert sanitize_job_id("spaces not ok") == "unknown"


def test_parse_content_length():
    assert parse_content_length(None) == 0
    assert parse_content_length("") == 0
    assert parse_content_length("12") == 12
    try:
        parse_content_length("nope")
        raise AssertionError("expected ValueError")
    except ValueError as exc:
        assert "content_length" in str(exc)
    try:
        parse_content_length("-1")
        raise AssertionError("expected ValueError")
    except ValueError:
        pass
    try:
        parse_content_length(str(10**9), max_body=100)
        raise AssertionError("expected ValueError")
    except ValueError as exc:
        assert "body_trop_grand" in str(exc)


def test_check_internal_auth_constant_time_api():
    secret = "s3cret-value-xyz"
    with mock.patch.dict(os.environ, {"CONTAINER_SECRET": secret}):
        assert check_internal_auth(secret) is True
        assert check_internal_auth("wrong") is False
        assert check_internal_auth("") is False
        assert check_internal_auth(None) is False
        assert check_internal_auth("other", secret="other") is True
        assert check_internal_auth(secret, secret="other") is False
    assert check_internal_auth("anything", secret="") is False
    assert check_internal_auth("", secret="x") is False


def test_is_allowed_r2_upload_url():
    good = (
        "https://abc123.r2.cloudflarestorage.com/clippy-clips/clips/u/job.mp4"
        "?X-Amz-Algorithm=AWS4-HMAC-SHA256"
    )
    assert is_allowed_r2_upload_url(good) is True
    assert is_allowed_r2_upload_url("http://abc123.r2.cloudflarestorage.com/b/k") is False
    assert is_allowed_r2_upload_url("https://evil.com/clippy-clips/k") is False
    assert is_allowed_r2_upload_url("https://127.0.0.1/x") is False
    assert is_allowed_r2_upload_url("https://169.254.169.254/latest/meta-data") is False
    assert is_allowed_r2_upload_url("https://user:pass@abc.r2.cloudflarestorage.com/b/k") is False
    assert is_allowed_r2_upload_url("https://abc.r2.cloudflarestorage.com/") is False
    # Subdomain must end with .r2.cloudflarestorage.com
    assert is_allowed_r2_upload_url("https://r2.cloudflarestorage.com.evil.com/b/k") is False


def test_validate_r2_key():
    assert validate_r2_key("clips/user/job.mp4") is True
    assert validate_r2_key("clips/a/b/c.mp4") is True
    assert validate_r2_key("../etc/passwd.mp4") is False
    assert validate_r2_key("clips/../etc/passwd.mp4") is False
    assert validate_r2_key("clips/x.exe") is False
    assert validate_r2_key("") is False


def test_public_error_no_paths():
    err = public_error(RuntimeError("/tmp/clippy-job-xyz/secret.mp4 boom"))
    assert "/tmp/" not in err or err == "erreur_interne"
    assert public_error(RuntimeError("download_failed (section, exit=1): foo")).startswith(
        "download_failed"
    )


def test_done_uses_full_video_duration_not_section_probe():
    src = inspect.getsource(server_mod.Handler._handle_process)
    assert "fetch_video_duration(youtube_url)" in src
    assert "probe_media_duration(source)" not in src
    assert server_mod.fetch_video_duration is not None


if __name__ == "__main__":
    test_sanitize_job_id()
    test_parse_content_length()
    test_check_internal_auth_constant_time_api()
    test_is_allowed_r2_upload_url()
    test_validate_r2_key()
    test_public_error_no_paths()
    test_done_uses_full_video_duration_not_section_probe()
    print("ok")
