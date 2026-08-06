"""HTTP API: health + process (NDJSON progress stream, optional R2 PUT)."""

from __future__ import annotations

import concurrent.futures
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
from progress_map import crop_progress, download_progress, upload_progress

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


def put_r2(upload_url: str, path: Path, on_progress) -> None:
    data = path.read_bytes()
    on_progress(0.0)
    req = urllib.request.Request(
        upload_url,
        data=data,
        method="PUT",
        headers={
            "Content-Type": "video/mp4",
            "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
        },
    )
    on_progress(0.35)
    with urllib.request.urlopen(req, timeout=120) as resp:
        body = resp.read()
        if resp.status >= 400:
            raise RuntimeError(f"r2_put_http_{resp.status}: {body[:200]!r}")
    on_progress(1.0)


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
                    "protocol": "ndjson-v1",
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
        upload_url = str(body.get("uploadUrl") or "").strip()
        r2_key = str(body.get("r2Key") or "").strip()

        if not extract_video_id(youtube_url):
            json_response(self, 400, {"ok": False, "error": "url YouTube invalide"})
            return
        if end <= start:
            json_response(self, 400, {"ok": False, "error": "range invalide"})
            return

        # Stream NDJSON events so the Worker can write precise stage/% to D1.
        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.send_header("X-Clippy-Protocol", "ndjson-v1")
        self.send_header("X-Clippy-Job-Id", job_id)
        self.end_headers()

        last_emit = {"stage": "", "progress": -1.0}

        def emit(payload: dict) -> None:
            line = (json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8")
            self.wfile.write(line)
            self.wfile.flush()

        def emit_stage(stage: str, progress: float) -> None:
            p = max(0.0, min(1.0, float(progress)))
            # Skip tiny duplicates; always emit stage changes.
            if (
                stage == last_emit["stage"]
                and abs(p - float(last_emit["progress"])) < 0.005
                and p < 0.99
            ):
                return
            last_emit["stage"] = stage
            last_emit["progress"] = p
            emit({"type": "stage", "stage": stage, "progress": round(p, 4)})
            print(f"[dl] stage={stage} progress={p:.4f}")

        tmp = Path(tempfile.mkdtemp(prefix="clippy-job-"))
        try:
            from download import crop_clip, download_source, fetch_video_duration

            emit_stage("downloading", download_progress(0.0))

            duration_future: concurrent.futures.Future | None = None
            executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
            try:
                duration_future = executor.submit(fetch_video_duration, youtube_url)

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

                video_duration = None
                if duration_future is not None:
                    try:
                        video_duration = duration_future.result(timeout=5)
                    except Exception as meta_exc:  # noqa: BLE001
                        print(f"[dl] duration probe failed: {meta_exc}")

                bytes_len = out_path.stat().st_size
                if bytes_len < 1024:
                    raise RuntimeError("empty_clip")

                used_r2 = False
                if upload_url and r2_key:
                    emit_stage("uploading", upload_progress(0.0))
                    try:

                        def on_up(phase: float) -> None:
                            emit_stage("uploading", upload_progress(phase))

                        put_r2(upload_url, out_path, on_up)
                        used_r2 = True
                        emit(
                            {
                                "type": "done",
                                "mode": "r2",
                                "r2Key": r2_key,
                                "bytes": bytes_len,
                                "videoDuration": video_duration,
                            }
                        )
                    except Exception as up_exc:  # noqa: BLE001
                        print(f"[dl] r2 put failed, falling back to inline: {up_exc}")
                        used_r2 = False

                if not used_r2:
                    emit_stage("uploading", upload_progress(0.0))
                    data = out_path.read_bytes()
                    emit_stage("uploading", upload_progress(1.0))
                    # done line must be immediately followed by raw mp4 bytes (no more JSON).
                    emit(
                        {
                            "type": "done",
                            "mode": "inline",
                            "bytes": len(data),
                            "videoDuration": video_duration,
                        }
                    )
                    self.wfile.write(data)
                    self.wfile.flush()
            finally:
                executor.shutdown(wait=False, cancel_futures=True)
        except Exception as exc:  # noqa: BLE001
            traceback.print_exc()
            try:
                emit({"type": "error", "error": str(exc)[:500]})
            except Exception:  # noqa: BLE001
                pass
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"clippy-clip listening on {HOST}:{PORT} (max_height={MAX_HEIGHT}, protocol=ndjson-v1)")
    server.serve_forever()


if __name__ == "__main__":
    main()
