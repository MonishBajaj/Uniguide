# Enrichment worker: build with `docker build -t uniguide-worker worker` and run anywhere that can keep a
# process alive (Fly.io, Railway, Render). Set WORKER_DATABASE_URL, GEMINI_API_KEY and CRAWLER_CONTACT.
FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:0.11.32 /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 PYTHONUNBUFFERED=1
COPY pyproject.toml uv.lock README.md ./
COPY src ./src
RUN uv sync --frozen --no-dev
CMD ["uv", "run", "--no-dev", "uniguide-worker", "serve"]
