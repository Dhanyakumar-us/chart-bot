from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
import requests
import os
from dotenv import load_dotenv

from database import get_db, ChatMessage

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow production domains
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

class ChatRequest(BaseModel):
    message: str
    model: str = DEFAULT_MODEL

@app.get("/api/history")
def get_history(db: Session = Depends(get_db)):
    messages = db.query(ChatMessage).order_by(ChatMessage.timestamp.asc()).all()
    return messages

@app.delete("/api/history")
def clear_history(db: Session = Depends(get_db)):
    db.query(ChatMessage).delete()
    db.commit()
    return {"status": "cleared"}

@app.post("/api/chat")
def chat_with_groq(request: ChatRequest, db: Session = Depends(get_db)):
    # Save user message
    user_msg = ChatMessage(role="user", content=request.message)
    db.add(user_msg)
    db.commit()

    # Call Groq
    try:
        response = requests.post(
            GROQ_API_URL,
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "model": request.model,
                "messages": [{"role": "user", "content": request.message}],
            }
        )
        response.raise_for_status()
        bot_reply = response.json().get("choices", [{}])[0].get("message", {}).get("content", "")
    except requests.exceptions.HTTPError as e:
        bot_reply = f"Error connecting to Groq: {str(e)}. Details: {e.response.text}"
    except Exception as e:
        bot_reply = f"Error connecting to Groq: {str(e)}."

    # Save bot message
    bot_msg = ChatMessage(role="bot", content=bot_reply)
    db.add(bot_msg)
    db.commit()

    return {"response": bot_reply}

@app.delete("/api/history")
def clear_history(db: Session = Depends(get_db)):
    db.query(ChatMessage).delete()
    db.commit()
    return {"status": "cleared"}

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = await file.read()
    # Mock PDF summarizer logic
    summary = f"Summary of {file.filename}: This document contains {len(content)} bytes of data. Integration with text extraction can be added here."
    
    user_msg = ChatMessage(role="user", content=f"Uploaded {file.filename}")
    db.add(user_msg)
    bot_msg = ChatMessage(role="bot", content=summary)
    db.add(bot_msg)
    db.commit()
    return {"status": "success", "summary": summary}

@app.post("/api/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    try:
        content = await file.read()
        files = {
            "file": (file.filename, content, file.content_type or "audio/webm")
        }
        data = {
            "model": "whisper-large-v3",
            "response_format": "json"
        }
        headers = {
            "Authorization": f"Bearer {GROQ_API_KEY}"
        }
        res = requests.post(GROQ_AUDIO_URL, headers=headers, files=files, data=data)
        
        if res.status_code != 200:
            print("Groq Audio Error:", res.text)
            raise HTTPException(status_code=res.status_code, detail=f"Groq API Error: {res.text}")
            
        return {"text": res.json().get("text", "")}
    except Exception as e:
        print("Transcription Error:", str(e))
        raise HTTPException(status_code=500, detail=str(e))
