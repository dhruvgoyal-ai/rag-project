"""
Wraps ChromaDB (local, persistent, free) with sentence-transformers embeddings
(also local and free — no API key needed just to embed text).
"""

import chromadb
from chromadb.utils import embedding_functions

CHROMA_PATH = "chroma_db"
COLLECTION_NAME = "knowledge_base"

# Small, fast, good-quality open embedding model. Downloads once, then cached.
_embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
    model_name="all-MiniLM-L6-v2"
)

_client = chromadb.PersistentClient(path=CHROMA_PATH)
_collection = _client.get_or_create_collection(
    name=COLLECTION_NAME,
    embedding_function=_embedding_fn,
    metadata={"hnsw:space": "cosine"},
)


def add_documents(documents: list[dict]):
    """documents: list of {id, text, source, location}"""
    if not documents:
        return
    _collection.add(
        ids=[d["id"] for d in documents],
        documents=[d["text"] for d in documents],
        metadatas=[{"source": d["source"], "location": d["location"]} for d in documents],
    )


def query(query_text: str, top_k: int = 4) -> list[dict]:
    """
    Returns top_k chunks with similarity scores (0-1, higher = more relevant).
    Chroma's cosine 'distance' is converted to a similarity score.
    """
    count = _collection.count()
    if count == 0:
        return []

    results = _collection.query(
        query_texts=[query_text],
        n_results=min(top_k, count),
    )

    hits = []
    docs = results.get("documents", [[]])[0]
    metas = results.get("metadatas", [[]])[0]
    dists = results.get("distances", [[]])[0]

    for doc, meta, dist in zip(docs, metas, dists):
        similarity = max(0.0, 1.0 - dist)  # cosine distance -> similarity
        hits.append({
            "text": doc,
            "source": meta.get("source", "unknown"),
            "location": meta.get("location", ""),
            "similarity": round(similarity, 3),
        })
    return hits


def collection_stats() -> dict:
    return {
        "total_chunks": _collection.count(),
        "embedding_model": "all-MiniLM-L6-v2",
        "embedding_dimensions": 384,
        "distance_metric": "cosine",
    }


def get_indexed_sources() -> list[dict]:
    """Returns a list of unique indexed files with their chunk count."""
    count = _collection.count()
    if count == 0:
        return []

    data = _collection.get(include=["metadatas"])
    sources_map: dict[str, int] = {}
    for meta in data.get("metadatas", []):
        src = meta.get("source", "unknown")
        sources_map[src] = sources_map.get(src, 0) + 1

    return [{"filename": k, "chunks": v} for k, v in sources_map.items()]


def get_sample_chunks(limit: int = 20, source: str = None) -> list[dict]:
    """Returns sample chunks for UI inspection."""
    count = _collection.count()
    if count == 0:
        return []

    kwargs = {"limit": min(limit, count), "include": ["documents", "metadatas"]}
    if source:
        kwargs["where"] = {"source": source}

    data = _collection.get(**kwargs)
    result = []
    docs = data.get("documents", [])
    metas = data.get("metadatas", [])
    ids = data.get("ids", [])
    for doc, meta, cid in zip(docs, metas, ids):
        result.append({
            "id": cid,
            "text": doc,
            "source": meta.get("source", "unknown"),
            "location": meta.get("location", ""),
            "char_count": len(doc),
            "word_count": len(doc.split()),
        })
    return result


def reset_collection():
    """Wipe the knowledge base (used for a 'clear' endpoint)."""
    global _collection
    _client.delete_collection(COLLECTION_NAME)
    _collection = _client.get_or_create_collection(
        name=COLLECTION_NAME,
        embedding_function=_embedding_fn,
        metadata={"hnsw:space": "cosine"},
    )

