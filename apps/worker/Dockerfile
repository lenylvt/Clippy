FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DENO_INSTALL=/usr/local \
    PATH="/usr/local/bin:${PATH}"

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
    curl \
    unzip \
  && rm -rf /var/lib/apt/lists/*

# Deno: required by modern yt-dlp for YouTube JS / n-challenge.
RUN curl -fsSL https://deno.land/install.sh | sh \
  && deno --version

# Always pull a current yt-dlp; YouTube breaks older extractors quickly.
RUN pip install --no-cache-dir -U "yt-dlp[default]" \
  && yt-dlp --version

WORKDIR /app
COPY container/download.py container/server.py container/progress_map.py ./

EXPOSE 8080

CMD ["python", "-u", "server.py"]
