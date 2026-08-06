"""HTTP API: health + process (NDJSON progress stream, optional R2 PUT)."""

from __future__ import annotations

import hashlib
import hmac
import http.client
import json
import math
import os
import re
import shutil
import signal
import socket
import tempfile
import threading
import time
import traceback
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Callable
from urllib.parse import urlparse

from download import (
    FORMAT_SELECTOR,
    MAX_CLIP_SECONDS,
    MAX_HEIGHT,
    MIN_CLIP_SECONDS,
    crop_clip,
    download_source,
    extract_video_id,
    fetch_video_duration,
    validate_clip_range,
)
from progress_map import crop_progress, download_progress, upload_progress

HOST = "0.0.0.0"
PORT = int(os.environ.get("PORT", "8080"))
MAX_BODY_BYTES = int(os.environ.get("MAX_BODY_BYTES", str(64 * 1024)))
MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_BYTES", str(100 * 1024 * 1024)))
MAX_CONCURRENT_JOBS = max(1, int(os.environ.get("MAX_CONCURRENT_JOBS", "2")))
R2_PUT_TIMEOUT_S = int(os.environ.get("R2_PUT_TIMEOUT_S", "120"))
R2_PUT_RETRIES = max(1, int(os.environ.get("R2_PUT_RETRIES", "3")))
JOB_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
R2_KEY_RE = re.compile(r"^clips/[A-Za-z0-9_.\-/]+\.mp4$")
R2_HOST_SUFFIX = ".r2.cloudflarestorage.com"

_job_semaphore = threading.Semaphore(MAX_CONCURRENT_JOBS)
_active_tmps: set[Path] = set()
_active_tmps_lock = threading.Lock()
_shutdown = threading.Event()


def sanitize_job_id(value: str) -> str:
    v = (value or "").strip()
    if JOB_ID_RE.fullmatch(v):
        return v
    return "unknown"


def parse_content_length(raw: str | None, *, max_body: int = MAX_BODY_BYTES) -> int:
    if raw is None or raw == "":
        return 0
    try:
        length = int(raw)
    except (TypeError, ValueError) as exc:
        raise ValueError("content_length_invalide") from exc
    if length < 0:
        raise ValueError("content_length_invalide")
    if length > max_body:
        raise ValueError("body_trop_grand")
    return length


def check_internal_auth(header_value: str | None, secret: str | None = None) -> bool:
    """Constant-time compare of X-Clippy-Internal vs CONTAINER_SECRET. Fail-closed."""
    expected = secret if secret is not None else os.environ.get("CONTAINER_SECRET", "")
    if not expected:
        return False
    provided = header_value or ""
    # Hash first so compare_digest is fixed-length even when header/secret lengths differ.
    return hmac.compare_digest(
        hashlib.sha256(provided.encode("utf-8")).digest(),
        hashlib.sha256(expected.encode("utf-8")).digest(),
    )


def is_allowed_r2_upload_url(upload_url: str) -> bool:
    """Allow only HTTPS Cloudflare R2 S3 endpoints (no IP, no userinfo, no redirects later)."""
    try:
        parsed = urlparse(upload_url)
    except ValueError:
        return False
    if parsed.scheme != "https":
        return False
    if parsed.username is not None or parsed.password is not None:
        return False
    host = (parsed.hostname or "").lower()
    if not host.endswith(R2_HOST_SUFFIX):
        return False
    # Reject raw IPv4/IPv6 in host (R2 uses DNS names).
    if re.fullmatch(r"\d{1,3}(?:\.\d{1,3}){3}", host):
        return False
    if ":" in host:  # IPv6 literal
        return False
    if not parsed.path or parsed.path == "/":
        return False
    return True


def validate_r2_key(r2_key: str) -> bool:
    if not R2_KEY_RE.fullmatch(r2_key):
        return False
    if ".." in r2_key or r2_key.startswith("/") or "//" in r2_key:
        return False
    return True


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001,N802
        raise urllib.error.HTTPError(newurl, code, f"redirect_refused:{code}", headers, fp)


_R2_OPENER = urllib.request.build_opener(_NoRedirect)


class _ProgressReader:
    """File reader that reports upload progress by bytes read (urllib body)."""

    def __init__(self, path: Path, on_progress: Callable[[float], None] | None) -> None:
        self._path = path
        self._size = path.stat().st_size
        self._fp = path.open("rb")
        self._read = 0
        self._on_progress = on_progress
        self._last = -1.0

    def read(self, size: int = -1) -> bytes:
        chunk = self._fp.read(size)
        if chunk:
            self._read += len(chunk)
            if self._on_progress and self._size > 0:
                phase = min(1.0, self._read / self._size)
                if phase - self._last >= 0.02 or phase >= 0.99 or self._read >= self._size:
                    self._on_progress(phase)
                    self._last = phase
        return chunk

    def __len__(self) -> int:
        return self._size

    def close(self) -> None:
        self._fp.close()


def put_r2(upload_url: str, path: Path, on_progress: Callable[[float], None] | None) -> None:
    if not is_allowed_r2_upload_url(upload_url):
        raise RuntimeError("upload_url_refusee")

    size = path.stat().st_size
    if size <= 0 or size > MAX_UPLOAD_BYTES:
        raise RuntimeError("clip_taille_invalide")

    last_err: Exception | None = None
    for attempt in range(R2_PUT_RETRIES):
        reader = _ProgressReader(path, on_progress)
        try:
            if on_progress:
                on_progress(0.0)
            req = urllib.request.Request(
                upload_url,
                data=reader,  # type: ignore[arg-type]
                method="PUT",
                headers={
                    "Content-Type": "video/mp4",
                    "Content-Length": str(size),
                    # Must match Worker SigV4 SignedHeaders — do not add extra headers.
                    "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
                },
            )
            with _R2_OPENER.open(req, timeout=R2_PUT_TIMEOUT_S) as resp:
                body = resp.read(512)
                # urlopen raises on 4xx/5xx; keep a defensive check for odd handlers.
                status = getattr(resp, "status", None) or resp.getcode()
                if status is not None and int(status) >= 400:
                    raise RuntimeError(f"r2_put_http_{status}: {body[:200]!r}")
            if on_progress:
                on_progress(1.0)
            return
        except urllib.error.HTTPError as exc:
            last_err = RuntimeError(f"r2_put_http_{exc.code}: {(exc.read(200) or b'')!r}")
            # Retry only transient statuses.
            if exc.code not in {408, 429, 500, 502, 503, 504} or attempt + 1 >= R2_PUT_RETRIES:
                raise last_err from exc
        except (urllib.error.URLError, TimeoutError, socket.timeout, http.client.HTTPException) as exc:
            last_err = RuntimeError(f"r2_put_network: {exc}")
            if attempt + 1 >= R2_PUT_RETRIES:
                raise last_err from exc
        finally:
            reader.close()
        time.sleep(0.4 * (2**attempt))

    raise last_err or RuntimeError("r2_put_failed")


def json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(body)


def read_json_body(handler: BaseHTTPRequestHandler) -> dict:
    length = parse_content_length(handler.headers.get("Content-Length"))
    if length <= 0:
        return {}
    raw = handler.rfile.read(length)
    if not raw:
        return {}
    if len(raw) > MAX_BODY_BYTES:
        raise ValueError("body_trop_grand")
    return json.loads(raw.decode("utf-8"))


def _register_tmp(path: Path) -> None:
    with _active_tmps_lock:
        _active_tmps.add(path)


def _unregister_tmp(path: Path) -> None:
    with _active_tmps_lock:
        _active_tmps.discard(path)


def _cleanup_all_tmps() -> None:
    with _active_tmps_lock:
        paths = list(_active_tmps)
        _active_tmps.clear()
    for path in paths:
        try:
            shutil.rmtree(path, ignore_errors=False)
        except OSError as exc:
            print(f"[dl] cleanup tmp failed {path}: {exc}")
            shutil.rmtree(path, ignore_errors=True)


def public_error(exc: BaseException) -> str:
    """Normalize exceptions so NDJSON clients never see internal paths."""
    msg = str(exc)
    known = {
        "download_failed",
        "download_timeout",
        "ffmpeg_failed",
        "timeout",
        "codec_incompatible",
        "upload_url_refusee",
        "clip_taille_invalide",
        "r2_put_http",
        "r2_put_network",
        "r2_put_failed",
        "empty_clip",
        "durée clip incohérente",
        "hauteur",
        "URL YouTube invalide",
        "range invalide",
        "range non fini",
        "range négatif",
        "clip trop court",
        "clip trop long",
        "fichier source",
        "durée invalide",
    }
    for prefix in known:
        if msg.startswith(prefix) or msg.startswith(f"{prefix} "):
            return msg[:500]
    # Allow a few structured RuntimeError prefixes with details.
    for prefix in ("download_failed", "download_timeout", "r2_put_", "codec_incompatible:"):
        if msg.startswith(prefix):
            return msg[:500]
    return "erreur_interne"


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args) -> None:
        print(f"[dl] {self.address_string()} - {fmt % args}")

    def _require_auth(self) -> bool:
        if check_internal_auth(self.headers.get("X-Clippy-Internal")):
            return True
        json_response(self, 401, {"ok": False, "error": "non autorisé"})
        return False

    def do_GET(self) -> None:
        path = urlparse(self.path).path.rstrip("/") or "/"
        if path in ("/ping", "/health"):
            # Health stays unauthenticated for orchestrator probes.
            json_response(
                self,
                200,
                {
                    "ok": True,
                    "service": "clippy-clip",
                    "max_height": MAX_HEIGHT,
                    "max_clip_seconds": MAX_CLIP_SECONDS,
                    "min_clip_seconds": MIN_CLIP_SECONDS,
                    "format_selector": FORMAT_SELECTOR,
                    "protocol": "ndjson-v1",
                },
            )
            return
        json_response(self, 404, {"ok": False, "error": "introuvable"})

    def do_POST(self) -> None:
        path = urlparse(self.path).path.rstrip("/") or "/"
        if path != "/process":
            json_response(self, 404, {"ok": False, "error": "introuvable"})
            return

        if not self._require_auth():
            return

        if _shutdown.is_set():
            json_response(self, 503, {"ok": False, "error": "arrêt en cours"})
            return

        if not _job_semaphore.acquire(blocking=False):
            json_response(self, 503, {"ok": False, "error": "serveur occupé"})
            return

        try:
            self._handle_process()
        finally:
            _job_semaphore.release()

    def _handle_process(self) -> None:
        try:
            body = read_json_body(self)
        except ValueError as exc:
            json_response(self, 400, {"ok": False, "error": str(exc)})
            return
        except json.JSONDecodeError:
            json_response(self, 400, {"ok": False, "error": "JSON invalide"})
            return

        if not isinstance(body, dict):
            json_response(self, 400, {"ok": False, "error": "JSON invalide"})
            return

        job_id = sanitize_job_id(str(body.get("jobId") or ""))
        youtube_url = str(body.get("youtubeUrl") or "")
        upload_url = str(body.get("uploadUrl") or "").strip()
        r2_key = str(body.get("r2Key") or "").strip()

        try:
            start = float(body.get("start"))
            end = float(body.get("end"))
        except (TypeError, ValueError):
            json_response(self, 400, {"ok": False, "error": "range invalide"})
            return

        if not math.isfinite(start) or not math.isfinite(end):
            json_response(self, 400, {"ok": False, "error": "range non fini"})
            return

        if not extract_video_id(youtube_url):
            json_response(self, 400, {"ok": False, "error": "url YouTube invalide"})
            return

        try:
            validate_clip_range(start, end)
        except ValueError as exc:
            json_response(self, 400, {"ok": False, "error": str(exc)})
            return

        if upload_url or r2_key:
            if not upload_url or not r2_key:
                json_response(self, 400, {"ok": False, "error": "upload R2 incomplet"})
                return
            if not is_allowed_r2_upload_url(upload_url):
                json_response(self, 400, {"ok": False, "error": "upload_url_refusee"})
                return
            if not validate_r2_key(r2_key):
                json_response(self, 400, {"ok": False, "error": "r2_key invalide"})
                return

        # Stream NDJSON events so the Worker can write precise stage/% to D1.
        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.send_header("X-Clippy-Protocol", "ndjson-v1")
        self.send_header("X-Clippy-Job-Id", job_id)
        self.end_headers()

        last_stage = ""
        last_progress = -1.0
        client_gone = False

        def emit(payload: dict) -> None:
            nonlocal client_gone
            if client_gone:
                return
            line = (json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8")
            try:
                self.wfile.write(line)
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, OSError):
                client_gone = True

        def emit_stage(stage: str, progress: float) -> None:
            nonlocal last_stage, last_progress
            p = max(0.0, min(1.0, float(progress)))
            if (
                stage == last_stage
                and abs(p - last_progress) < 0.005
                and 0.0 < p < 0.99
            ):
                return
            last_stage = stage
            last_progress = p
            emit({"type": "stage", "stage": stage, "progress": round(p, 4)})
            print(f"[dl] stage={stage} progress={p:.4f}")

        tmp = Path(tempfile.mkdtemp(prefix="clippy-job-"))
        _register_tmp(tmp)
        try:
            emit_stage("downloading", download_progress(0.0))

            def on_dl_progress(pct: float) -> None:
                emit_stage("downloading", download_progress(pct))

            source_dir = tmp / "src"
            source, offset = download_source(
                youtube_url,
                source_dir,
                start,
                end,
                on_progress=on_dl_progress,
            )
            emit_stage("downloading", download_progress(1.0))

            emit_stage("cropping", crop_progress(0.0))
            out_path = tmp / "clip.mp4"
            clip_len = end - start

            def on_crop_progress(phase: float) -> None:
                emit_stage("cropping", crop_progress(phase))

            crop_clip(source, offset, offset + clip_len, out_path, on_progress=on_crop_progress)
            emit_stage("cropping", crop_progress(1.0))

            # Full YouTube duration (not the padded section file length).
            video_duration = fetch_video_duration(youtube_url)

            bytes_len = out_path.stat().st_size
            if bytes_len < 1024 or bytes_len > MAX_UPLOAD_BYTES:
                raise RuntimeError("empty_clip" if bytes_len < 1024 else "clip_taille_invalide")

            if upload_url and r2_key:
                emit_stage("uploading", upload_progress(0.0))

                def on_up(phase: float) -> None:
                    emit_stage("uploading", upload_progress(phase))

                put_r2(upload_url, out_path, on_up)
                emit_stage("uploading", upload_progress(1.0))
                emit(
                    {
                        "type": "done",
                        "mode": "r2",
                        "r2Key": r2_key,
                        "bytes": bytes_len,
                        "videoDuration": video_duration,
                    }
                )
            else:
                # Inline: NDJSON stages must finish before raw mp4 bytes (processStream contract).
                emit_stage("uploading", upload_progress(0.0))
                emit_stage("uploading", upload_progress(1.0))
                emit(
                    {
                        "type": "done",
                        "mode": "inline",
                        "bytes": bytes_len,
                        "videoDuration": video_duration,
                    }
                )
                with out_path.open("rb") as fp:
                    while True:
                        chunk = fp.read(1024 * 1024)
                        if not chunk:
                            break
                        try:
                            self.wfile.write(chunk)
                        except (BrokenPipeError, ConnectionResetError, OSError):
                            client_gone = True
                            break
                if not client_gone:
                    try:
                        self.wfile.flush()
                    except (BrokenPipeError, ConnectionResetError, OSError):
                        pass
        except Exception as exc:  # noqa: BLE001
            traceback.print_exc()
            try:
                emit({"type": "error", "error": public_error(exc)})
            except Exception:  # noqa: BLE001
                pass
        finally:
            try:
                shutil.rmtree(tmp, ignore_errors=False)
            except OSError as cleanup_exc:
                print(f"[dl] cleanup tmp failed {tmp}: {cleanup_exc}")
                shutil.rmtree(tmp, ignore_errors=True)
            _unregister_tmp(tmp)


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), Handler)

    def _handle_signal(signum: int, _frame: object) -> None:
        print(f"[dl] signal {signum}, arrêt…")
        _shutdown.set()
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)

    print(
        f"clippy-clip listening on {HOST}:{PORT} "
        f"(max_height={MAX_HEIGHT}, max_jobs={MAX_CONCURRENT_JOBS}, protocol=ndjson-v1)"
    )
    try:
        server.serve_forever(poll_interval=0.5)
    finally:
        server.server_close()
        _cleanup_all_tmps()
        print("[dl] arrêté")


if __name__ == "__main__":
    main()
