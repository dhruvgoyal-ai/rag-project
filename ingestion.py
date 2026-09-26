"""
Handles turning uploaded files into clean, citation-friendly text chunks.

Each chunk keeps metadata about exactly where it came from (file name + page,
or file name + paragraph number) so that later, when the LLM cites a source,
we can show the user precisely what backs up that claim.
"""

import os
import re
import uuid
from typing import List, Dict, Any

from pypdf import PdfReader


def load_pdf(file_path: str) -> List[Dict[str, Any]]:
    """Extract text from a PDF, one entry per page, tagged with page number."""
    reader = PdfReader(file_path)
    filename = os.path.basename(file_path)
    pages = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        text = text.strip()
        if text:
            pages.append({
                "text": text,
                "source": filename,
                "location": f"page {i + 1}",
                "page_num": i + 1,
            })
    return pages


def load_text(file_path: str) -> List[Dict[str, Any]]:
    """Load a plain .txt/.md file as a single block (chunked later)."""
    filename = os.path.basename(file_path)
    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        text = f.read().strip()
    return [{
        "text": text,
        "source": filename,
        "location": "full document",
        "page_num": 1,
    }] if text else []


def chunk_text(text: str, chunk_size: int = 900, overlap: int = 150) -> List[str]:
    """
    Split text into overlapping chunks by characters, breaking on sentence
    boundaries where possible so we don't cut facts in half.
    """
    detailed = chunk_text_detailed(text, chunk_size=chunk_size, overlap=overlap)
    return [c["text"] for c in detailed]


def chunk_text_detailed(text: str, chunk_size: int = 900, overlap: int = 150) -> List[Dict[str, Any]]:
    """
    Splits text into chunks with full metadata, tracking exact character positions
    and the overlapping context between consecutive chunks for visualization.
    """
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return []

    if len(text) <= chunk_size:
        return [{
            "index": 1,
            "text": text,
            "start_char": 0,
            "end_char": len(text),
            "char_count": len(text),
            "word_count": len(text.split()),
            "overlap_prefix": "",
            "overlap_suffix": "",
        }]

    chunks: List[Dict[str, Any]] = []
    start = 0
    idx = 1
    prev_end = None

    while start < len(text):
        end = start + chunk_size
        if end < len(text):
            # Try to break at the last sentence end within the second half of window
            window = text[start:end]
            last_period = max(window.rfind(". "), window.rfind(".\n"), window.rfind("? "), window.rfind("! "))
            if last_period > chunk_size * 0.5:
                end = start + last_period + 1
        else:
            end = len(text)

        chunk_str = text[start:end].strip()
        if chunk_str:
            # Overlap prefix is text shared with previous chunk
            overlap_prefix = ""
            if prev_end is not None and start < prev_end:
                overlap_prefix = text[start:min(prev_end, end)].strip()

            chunks.append({
                "index": idx,
                "text": chunk_str,
                "start_char": start,
                "end_char": end,
                "char_count": len(chunk_str),
                "word_count": len(chunk_str.split()),
                "overlap_prefix": overlap_prefix,
                "overlap_suffix": "",
            })
            idx += 1

        prev_end = end
        if end >= len(text):
            break

        start = max(end - overlap, start + 1)

    # Compute overlap_suffix for each chunk (what it shares with next chunk)
    for i in range(len(chunks) - 1):
        chunks[i]["overlap_suffix"] = chunks[i + 1]["overlap_prefix"]

    return chunks


def process_file(file_path: str, chunk_size: int = 900, overlap: int = 150) -> List[Dict[str, Any]]:
    """
    Full pipeline for one uploaded file: load -> chunk -> attach metadata + id.
    Returns a list of dicts ready to insert into the vector store.
    """
    detailed = process_file_detailed(file_path, chunk_size=chunk_size, overlap=overlap)
    return detailed["documents"]


def process_file_detailed(file_path: str, chunk_size: int = 900, overlap: int = 150) -> Dict[str, Any]:
    """
    Full pipeline for one uploaded file returning documents for ChromaDB
    PLUS rich chunk telemetry for real-time visualization.
    """
    ext = os.path.splitext(file_path)[1].lower()
    filename = os.path.basename(file_path)

    if ext == ".pdf":
        raw_units = load_pdf(file_path)
    elif ext in (".txt", ".md"):
        raw_units = load_text(file_path)
    else:
        raise ValueError(f"Unsupported file type: {ext}. Use PDF or .txt/.md")

    documents: List[Dict[str, Any]] = []
    all_chunks_detail: List[Dict[str, Any]] = []
    total_raw_chars = sum(len(u["text"]) for u in raw_units)

    global_chunk_idx = 1
    for unit in raw_units:
        unit_chunks = chunk_text_detailed(unit["text"], chunk_size=chunk_size, overlap=overlap)
        num_pieces = len(unit_chunks)

        for j, c in enumerate(unit_chunks):
            chunk_id = str(uuid.uuid4())
            loc_str = unit["location"] if num_pieces == 1 else f"{unit['location']}, part {j + 1}"

            # Document for ChromaDB
            documents.append({
                "id": chunk_id,
                "text": c["text"],
                "source": unit["source"],
                "location": loc_str,
            })

            # Detail for UI visualizer
            all_chunks_detail.append({
                "id": chunk_id,
                "global_index": global_chunk_idx,
                "source": unit["source"],
                "location": loc_str,
                "page_num": unit.get("page_num", 1),
                "text": c["text"],
                "char_count": c["char_count"],
                "word_count": c["word_count"],
                "overlap_prefix": c["overlap_prefix"],
                "overlap_suffix": c["overlap_suffix"],
            })
            global_chunk_idx += 1

    return {
        "filename": filename,
        "file_type": ext,
        "total_units": len(raw_units),
        "total_chars": total_raw_chars,
        "documents": documents,
        "chunks_detail": all_chunks_detail,
        "total_chunks": len(documents),
    }
