FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DENO_INSTALL=/usr/local \
    PATH="/usr/local/bin:${PATH}"

# Pin Deno for supply-chain reproducibility (yt-dlp YouTube JS / n-challenge).
ARG DENO_VERSION=2.4.5
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
    curl \
    unzip \
  && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
  arch="$(uname -m)"; \
  case "$arch" in \
    x86_64) deno_arch="x86_64-unknown-linux-gnu" ;; \
    aarch64|arm64) deno_arch="aarch64-unknown-linux-gnu" ;; \
    *) echo "unsupported arch: $arch" >&2; exit 1 ;; \
  esac; \
  curl -fsSL "https://github.com/denoland/deno/releases/download/v${DENO_VERSION}/deno-${deno_arch}.zip" -o /tmp/deno.zip; \
  unzip -o /tmp/deno.zip -d /usr/local/bin; \
  chmod +x /usr/local/bin/deno; \
  rm /tmp/deno.zip; \
  deno --version

# Pin yt-dlp; bump intentionally when YouTube extractors break.
RUN pip install --no-cache-dir "yt-dlp[default]==2026.7.4" \
  && yt-dlp --version

WORKDIR /app
COPY container/download.py container/server.py container/progress_map.py ./

# CONTAINER_SECRET is injected at runtime (ClipContainer.envVars) for /process auth.

EXPOSE 8080

CMD ["python", "-u", "server.py"]
