"""HTTP API: health + process (download ≤1080p + ffmpeg crop)."""

from __future__ import annotations

import json
import shutil
import tempfile
import traceback
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from download import FORMAT_SELECTOR, MAX_HEIGHT, extract_video_id

HOST = "0.0.0.0"
PORT = 8080


def json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(body)


def read_json_body(handler: BaseHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("Content-Length") or "0")
    if length <= 0:
        return {}
    raw = handler.rfile.read(length)
    if not raw:
        return {}
    return json.loads(raw.decode("utf-8"))


def report_stage(callback_base: str, secret: str, job_id: str, stage: str, progress: float) -> None:
    if not callback_base or not secret or not job_id:
        return
    url = f"{callback_base.rstrip('/')}/api/internal/jobs/{job_id}"
    payload = json.dumps({"stage": stage, "progress": progress}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        method="PATCH",
        headers={
            "Content-Type": "application/json",
            "X-Clippy-Internal": secret,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            resp.read()
    except urllib.error.URLError as exc:
        print(f"[dl] stage report failed: {exc}")


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args) -> None:
        print(f"[dl] {self.address_string()} - {fmt % args}")

    def do_GET(self) -> None:
        path = urlparse(self.path).path.rstrip("/") or "/"
        if path in ("/ping", "/health"):
            json_response(
                self,
                200,
                {
                    "ok": True,
                    "service": "clippy-clip",
                    "max_height": MAX_HEIGHT,
                    "format_selector": FORMAT_SELECTOR,
                },
            )
            return
        json_response(self, 404, {"ok": False, "error": "not found"})

    def do_POST(self) -> None:
        path = urlparse(self.path).path.rstrip("/") or "/"
        if path != "/process":
            json_response(self, 404, {"ok": False, "error": "not found"})
            return

        try:
            body = read_json_body(self)
        except json.JSONDecodeError:
            json_response(self, 400, {"ok": False, "error": "JSON invalide"})
            return

        job_id = str(body.get("jobId") or "")
        youtube_url = str(body.get("youtubeUrl") or "")
        start = float(body.get("start") or 0)
        end = float(body.get("end") or 0)
        callback_base = str(body.get("callbackBase") or "")
        secret = str(body.get("secret") or "")

        if not extract_video_id(youtube_url):
            json_response(self, 400, {"ok": False, "error": "url YouTube invalide"})
            return
        if end <= start:
            json_response(self, 400, {"ok": False, "error": "range invalide"})
            return

        tmp = Path(tempfile.mkdtemp(prefix="clippy-job-"))
        try:
            report_stage(callback_base, secret, job_id, "downloading", 0.1)
            # process_clip does download then crop; report crop mid-way via wrapper
            source_dir = tmp / "src"
            from download import crop_clip, download_source

            source = download_source(youtube_url, source_dir)
            report_stage(callback_base, secret, job_id, "cropping", 0.55)
            out_path = tmp / "clip.mp4"
            crop_clip(source, start, end, out_path)
            report_stage(callback_base, secret, job_id, "uploading", 0.85)

            data = out_path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "video/mp4")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("X-Clippy-Job-Id", job_id)
            self.send_header("X-Clippy-Bytes", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except Exception as exc:  # noqa: BLE001
            traceback.print_exc()
            report_stage(callback_base, secret, job_id, "error", 1.0)
            json_response(self, 500, {"ok": False, "error": str(exc)})
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"clippy-clip listening on {HOST}:{PORT} (max_height={MAX_HEIGHT})")
    server.serve_forever()


if __name__ == "__main__":
    main()
