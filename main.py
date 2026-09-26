import os
import shutil
from dotenv import load_dotenv

load_dotenv()  # must happen before rag_pipeline reads env vars

from typing import Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import ingestion
import vectorstore
import rag_pipeline

app = FastAPI(title="Visual RAG Studio & Chunking Explainer")

UPLOAD_DIR = "data"
os.makedirs(UPLOAD_DIR, exist_ok=True)


class AskRequest(BaseModel):
    question: str


class PreviewChunkRequest(BaseModel):
    text: str
    chunk_size: Optional[int] = 900
    overlap: Optional[int] = 150


@app.post("/upload")
async def upload_files(
    files: list[UploadFile] = File(...),
    chunk_size: int = Form(900),
    overlap: int = Form(150),
):
    """
    Accepts one or more PDF/.txt/.md files, chunks them with sentence boundary preservation,
    and returns rich chunking telemetry for real-time visualization before indexing.
    """
    results = []
    all_new_chunks = []

    for file in files:
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in (".pdf", ".txt", ".md"):
            results.append({
                "file": file.filename,
                "status": "skipped (unsupported type)",
                "chunks": 0,
            })
            continue

        save_path = os.path.join(UPLOAD_DIR, file.filename)
        with open(save_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        try:
            detailed = ingestion.process_file_detailed(
                save_path,
                chunk_size=chunk_size,
                overlap=overlap,
            )
            # Add to vector store
            vectorstore.add_documents(detailed["documents"])
            all_new_chunks.extend(detailed["chunks_detail"])

            results.append({
                "file": file.filename,
                "status": "indexed",
                "chunks": detailed["total_chunks"],
                "total_units": detailed["total_units"],
                "total_chars": detailed["total_chars"],
                "chunks_detail": detailed["chunks_detail"],
            })
        except Exception as e:
            results.append({
                "file": file.filename,
                "status": f"error: {str(e)}",
                "chunks": 0,
            })

    return {
        "results": results,
        "new_chunks": all_new_chunks,
        "stats": vectorstore.collection_stats(),
        "documents": vectorstore.get_indexed_sources(),
    }


@app.post("/preview-chunking")
async def preview_chunking(req: PreviewChunkRequest):
    """
    Simulates real-time chunking on any arbitrary text or pasted content
    so users can visually experiment with chunk sizes and overlap values.
    """
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    chunk_size = max(100, min(req.chunk_size or 900, 4000))
    overlap = max(0, min(req.overlap or 150, int(chunk_size * 0.8)))

    chunks = ingestion.chunk_text_detailed(req.text, chunk_size=chunk_size, overlap=overlap)
    return {
        "text_length": len(req.text),
        "chunk_size": chunk_size,
        "overlap": overlap,
        "total_chunks": len(chunks),
        "chunks": chunks,
    }


@app.get("/documents")
async def get_documents():
    """Returns list of indexed documents and their chunk counts."""
    return {
        "documents": vectorstore.get_indexed_sources(),
        "stats": vectorstore.collection_stats(),
    }


@app.get("/chunks")
async def get_chunks(source: Optional[str] = Query(None), limit: int = Query(30)):
    """Returns sample chunks stored in vector store for inspection."""
    chunks = vectorstore.get_sample_chunks(limit=limit, source=source)
    return {"total": len(chunks), "chunks": chunks}


@app.post("/ask")
async def ask_question(req: AskRequest):
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")
    result = rag_pipeline.answer_question(req.question)
    return result


@app.get("/stats")
async def stats():
    return vectorstore.collection_stats()


@app.post("/reset")
async def reset():
    vectorstore.reset_collection()
    # Clean files from data directory
    for fname in os.listdir(UPLOAD_DIR):
        fpath = os.path.join(UPLOAD_DIR, fname)
        if os.path.isfile(fpath):
            try:
                os.remove(fpath)
            except Exception:
                pass
    return {
        "status": "knowledge base cleared",
        "stats": vectorstore.collection_stats(),
        "documents": [],
    }


# Serve static assets
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def root():
    return FileResponse("static/index.html")

