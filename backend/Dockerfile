# backend/Dockerfile
# Multi-stage build: dependencies are compiled in a builder image and only the
# resulting virtualenv is copied into a slim runtime image that runs as non-root.

# ---------- Stage 1: build dependencies ----------
FROM python:3.12-slim AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# ---------- Stage 2: runtime ----------
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /app

# libpq5 is the only system runtime dependency needed by the Postgres driver.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system appuser \
    && useradd --system --gid appuser --create-home appuser

COPY --from=builder /opt/venv /opt/venv

COPY --chown=appuser:appuser ./app ./app
COPY --chown=appuser:appuser alembic.ini .
COPY --chown=appuser:appuser ./alembic ./alembic

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)" || exit 1

# Apply migrations, then start the API server.
# --proxy-headers / --forwarded-allow-ips: the container only ever sits behind the
# frontend nginx (port 8000 is "expose"d, not published), so trust X-Forwarded-For from
# it; otherwise every client shares the proxy's IP and one rate-limit bucket.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'"]
