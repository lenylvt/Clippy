FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
    curl \
  && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir "yt-dlp[default]>=2025.1.0"

WORKDIR /app
COPY container/download.py container/server.py ./

EXPOSE 8080

CMD ["python", "-u", "server.py"]
