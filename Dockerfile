# ─────────────────────────────────────────────────────────────
# Stage 1: Build React frontend (Node.js)
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /app/ui

# Copy only ui package files first (maximize Docker layer cache)
COPY ui/package.json ui/package-lock.json* ./

# Install Node dependencies cleanly (ci = faster, reproducible)
RUN npm ci

# Copy all frontend source files
COPY ui/ ./

# Build the production React bundle → /app/ui/dist
RUN npm run build

# ─────────────────────────────────────────────────────────────
# Stage 2: Python FastAPI backend
# ─────────────────────────────────────────────────────────────
FROM python:3.11-slim AS backend
WORKDIR /app

# Install ffmpeg for audio conversion (needed by audio transcription)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source code
COPY app/ ./app/

# Copy the compiled React UI from Stage 1 into the location FastAPI expects
COPY --from=frontend-builder /app/ui/dist ./ui/dist

# Pre-create __pycache__ dirs and warm-up compilation to speed startup
RUN python3 -m compileall app/ -q

EXPOSE 8000

# Render injects $PORT dynamically; uvicorn must listen on that port
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
