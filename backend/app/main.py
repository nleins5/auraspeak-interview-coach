import os
import time
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.v1 import chat, audio
from app.config import ALLOWED_ORIGINS
from app.core.state import StateStore
from app.services.router import RouterService

# ── Structured Logging ────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-5s | %(name)s | %(message)s",
    datefmt="%H:%M:%S",
)
# Silence noisy libraries
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("openai").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logger = logging.getLogger("voice-function")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize StateStore and RouterService
    state_store = StateStore()
    app.state.state_store = state_store
    app.state.router_service = RouterService(state_store)
    app.state.rag_service = None

    yield
    # Cleanup

app = FastAPI(
    title="Voice Function",
    description="Voice coaching & speech-to-text platform with multi-provider STT routing.",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes — voice-function core
app.include_router(audio.router, prefix="/v1/audio", tags=["Audio (STT)"])
app.include_router(chat.router, prefix="/v1/chat", tags=["Chat (Voice Scoring)"])


@app.get("/health")
async def health_check():
    return {
        "status": "online",
        "app": "voice-function",
        "timestamp": time.time(),
        "version": "1.0.0",
    }

@app.middleware("http")
async def add_request_timing(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    elapsed = (time.perf_counter() - start) * 1000
    response.headers["X-Response-Time"] = f"{elapsed:.0f}ms"
    if elapsed > 5000:  # Log slow requests (>5s)
        logger.warning(f"Slow request: {request.method} {request.url.path} took {elapsed:.0f}ms")
    return response

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    logger.error(f"Unhandled error on {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal Server Error: {str(exc)}"}
    )

# Serve Vite UI. Antigravity repos build into root/dist; the original
# voice-function monorepo built into ui/dist.
root_path = os.path.dirname(os.path.dirname(__file__))
ui_path = os.path.join(root_path, "dist")
if not os.path.exists(ui_path):
    ui_path = os.path.join(root_path, "..", "frontend", "dist")
if not os.path.exists(ui_path):
    ui_path = os.path.join(root_path, "ui", "dist")
if os.path.exists(ui_path):
    assets_path = os.path.join(ui_path, "assets")
    if os.path.exists(assets_path):
        app.mount("/assets", StaticFiles(directory=assets_path), name="assets")
    
    @app.get("/{full_path:path}")
    async def serve_ui(full_path: str):
        if full_path.startswith("v1/"):
            raise HTTPException(status_code=404, detail="Not Found")
        file_path = os.path.join(ui_path, full_path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(ui_path, "index.html"))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
