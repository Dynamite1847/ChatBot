"""FastAPI application entrypoint with all routes."""
import json
import logging
import sys
from pathlib import Path
from typing import Optional

# ─── Logging Setup ─────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(str(Path(__file__).parent.parent / "logs" / "backend.log"), encoding="utf-8")
    ]
)
logger = logging.getLogger(__name__)

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse

from config import load_config, save_config
from models import (
    SessionCreate, SessionUpdate, ConfigUpdate, TokenCountRequest, ChatRequest
)
from sessions import (
    list_sessions, create_session, get_session,
    update_session, delete_session, clear_messages, pop_last_messages
)
from chat import stream_chat_response
from tokens import count_messages_tokens
from files import process_image, process_document

app = FastAPI(title="AI Client API", version="1.0.0")

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error on {request.method} {request.url}", exc_info=exc)
    return JSONResponse(status_code=500, content={"error": "Internal Server Error"})

# Attach our custom formatting to uvicorn loggers
for logger_name in ("uvicorn.access", "uvicorn.error", "uvicorn"):
    l = logging.getLogger(logger_name)
    l.handlers = logging.getLogger().handlers
    l.propagate = False

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Config ──────────────────────────────────────────────────────────────────

@app.get("/api/config")
def get_config():
    return load_config()


@app.put("/api/config")
def put_config(body: ConfigUpdate):
    save_config(body.config)
    return {"ok": True}


# ─── Sessions ─────────────────────────────────────────────────────────────────

@app.get("/api/sessions")
def get_sessions():
    return list_sessions()


@app.post("/api/sessions")
def post_session(body: SessionCreate):
    return create_session(name=body.name, system_prompt=body.system_prompt or "", params=body.params)


@app.get("/api/sessions/{session_id}")
def get_session_detail(session_id: str):
    s = get_session(session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    return s


@app.patch("/api/sessions/{session_id}")
def patch_session(session_id: str, body: SessionUpdate):
    s = update_session(session_id, name=body.name, system_prompt=body.system_prompt, params=body.params)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    return s


@app.delete("/api/sessions/{session_id}")
def del_session(session_id: str):
    if not delete_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    return {"ok": True}


@app.delete("/api/sessions/{session_id}/messages")
def del_messages(session_id: str):
    if not clear_messages(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    return {"ok": True}


@app.delete("/api/sessions/{session_id}/messages/last")
def del_last_messages(session_id: str, count: int = 2):
    """Remove the last `count` messages and return the last user message for retry."""
    last_user = pop_last_messages(session_id, count)
    if last_user is None:
        raise HTTPException(status_code=404, detail="Session not found or no messages")
    return {"ok": True, "last_user_message": last_user}


# ─── Chat Streaming ───────────────────────────────────────────────────────────

@app.post("/api/chat/stream")
async def chat_stream(body: ChatRequest):
    cfg = load_config()
    default_params = cfg.get("default_params", {})
    params = body.params

    return StreamingResponse(
        stream_chat_response(
            session_id=body.session_id,
            user_message=body.message,
            files=body.files,
            provider_name=body.provider,
            model=body.model,
            system_prompt=body.system_prompt,
            max_tokens=params.max_tokens if params else default_params.get("max_tokens", 8096),
            temperature=params.temperature if params else default_params.get("temperature", 1.0),
            top_p=params.top_p if params else default_params.get("top_p", 1.0),
            frequency_penalty=params.frequency_penalty if params else default_params.get("frequency_penalty", 0.0),
            context_strategy=body.context_strategy or cfg.get("context_strategy", "rounds"),
            context_rounds=body.context_rounds or cfg.get("context_rounds", 10),
            context_token_threshold=body.context_token_threshold or cfg.get("context_token_threshold", 8000),
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )


# ─── Token Count ──────────────────────────────────────────────────────────────

@app.post("/api/tokens/count")
def count_tokens(body: TokenCountRequest):
    messages = [{"role": m.role, "content": m.content} for m in body.messages]
    count = count_messages_tokens(messages)
    return {"token_count": count}


# ─── File Upload ──────────────────────────────────────────────────────────────

@app.post("/api/files/upload")
async def upload_file(
    file: UploadFile = File(...),
):
    file_bytes = await file.read()
    mime_type = file.content_type or "application/octet-stream"
    filename = file.filename or "upload"

    image_mime_types = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp"]

    if mime_type in image_mime_types or any(filename.lower().endswith(ext) for ext in [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"]):
        result = process_image(file_bytes, mime_type)
    else:
        result = process_document(file_bytes, filename, mime_type)

    result["filename"] = filename
    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)
