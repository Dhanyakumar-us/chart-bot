from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
import httpx
import json
import os
from dotenv import load_dotenv

from database import get_db, ChatMessage

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
if not GROQ_API_KEY:
    print("WARNING: GROQ_API_KEY not found in environment variables!")

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_AUDIO_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
DEFAULT_MODEL = "llama-3.3-70b-versatile"

# ─── Keep-Alive Ping ──────────────────────────────────────────────────────────
@app.get("/api/ping")
async def ping():
    """Health check — called by frontend every 4 min to prevent Render cold starts."""
    return {"status": "ok"}

# ─── Chat History ─────────────────────────────────────────────────────────────
@app.get("/api/history")
def get_history(db: Session = Depends(get_db)):
    messages = db.query(ChatMessage).order_by(ChatMessage.timestamp.asc()).all()
    return messages

@app.delete("/api/history")
def clear_history(db: Session = Depends(get_db)):
    db.query(ChatMessage).delete()
    db.commit()
    return {"status": "cleared"}

# ─── Chat (Streaming) ─────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    message: str
    model: str = DEFAULT_MODEL
    history: list = []  # Accept conversation history from frontend

@app.post("/api/chat")
async def chat_with_groq(request: ChatRequest, db: Session = Depends(get_db)):
    # Save user message to DB
    user_msg = ChatMessage(role="user", content=request.message)
    db.add(user_msg)
    db.commit()

    # Build messages array with history for context
    messages = []

    # System prompt for fast, concise responses
    messages.append({
        "role": "system",
        "content": (
            "You are NoLimits AI, a fast and helpful assistant specializing in data analysis and chart generation. "
            "Be concise and direct. When asked to make charts, respond with JSON data in a ```json code block "
            "with keys: type (bar/line/pie/area), title, data (array of objects). "
            "Otherwise, give clear, brief answers."
        )
    })

    # Add conversation history (last 10 messages for context without bloating)
    for msg in request.history[-10:]:
        messages.append({
            "role": msg.get("role", "user") if msg.get("role") != "bot" else "assistant",
            "content": msg.get("content", "")
        })

    # Add the current message
    messages.append({"role": "user", "content": request.message})

    # Stream the response from Groq
    async def stream_groq():
        full_response = ""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                async with client.stream(
                    "POST",
                    GROQ_API_URL,
                    headers={
                        "Authorization": f"Bearer {GROQ_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": request.model,
                        "messages": messages,
                        "stream": True,
                        "max_tokens": 1024,
                        "temperature": 0.7,
                    },
                ) as response:
                    if response.status_code != 200:
                        error_text = await response.aread()
                        yield f"data: {json.dumps({'error': error_text.decode()})}\n\n"
                        return

                    async for line in response.aiter_lines():
                        if line.startswith("data: "):
                            data = line[6:]
                            if data == "[DONE]":
                                break
                            try:
                                chunk = json.loads(data)
                                delta = chunk["choices"][0]["delta"].get("content", "")
                                if delta:
                                    full_response += delta
                                    yield f"data: {json.dumps({'delta': delta})}\n\n"
                            except Exception:
                                pass

        except httpx.TimeoutException:
            yield f"data: {json.dumps({'error': 'Request timed out. Please try again.'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        finally:
            # Save final bot response to DB
            if full_response:
                bot_msg = ChatMessage(role="bot", content=full_response)
                db.add(bot_msg)
                db.commit()
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        stream_groq(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # Disable Nginx buffering on Render
        }
    )

# ─── File Upload ──────────────────────────────────────────────────────────────
@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = await file.read()
    summary = (
        f"File '{file.filename}' uploaded successfully ({len(content):,} bytes). "
        "You can now ask me questions about this file's content."
    )
    user_msg = ChatMessage(role="user", content=f"Uploaded: {file.filename}")
    db.add(user_msg)
    bot_msg = ChatMessage(role="bot", content=summary)
    db.add(bot_msg)
    db.commit()
    return {"status": "success", "summary": summary}

# ─── Audio Transcription ──────────────────────────────────────────────────────
@app.post("/api/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    try:
        content = await file.read()
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                GROQ_AUDIO_URL,
                headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
                files={"file": (file.filename, content, file.content_type or "audio/webm")},
                data={"model": "whisper-large-v3", "response_format": "json"},
            )
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.text)
        return {"text": response.json().get("text", "")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
