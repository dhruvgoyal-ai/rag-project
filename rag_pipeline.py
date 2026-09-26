"""
RAG Pipeline

Flow:
1. RETRIEVE  -> get relevant chunks from ChromaDB
2. GROUND    -> answer using only retrieved chunks
3. CONFIDENCE -> estimate answer confidence
4. FALLBACK  -> use web search if local context is insufficient
"""

import os
import json

from dotenv import load_dotenv
from groq import Groq
from duckduckgo_search import DDGS

import vectorstore


# ============================================================
# ENVIRONMENT
# ============================================================

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

# Current Groq model
GROQ_MODEL = os.getenv(
    "GROQ_MODEL",
    "openai/gpt-oss-20b"
)

TOP_K = int(os.getenv("TOP_K", "4"))

SIMILARITY_THRESHOLD = float(
    os.getenv(
        "CONFIDENCE_SIMILARITY_THRESHOLD",
        "0.35"
    )
)


# ============================================================
# GROQ CLIENT
# ============================================================

_client = None

if GROQ_API_KEY:
    _client = Groq(api_key=GROQ_API_KEY)


# ============================================================
# SYSTEM PROMPT
# ============================================================

SYSTEM_PROMPT = """
You are a careful research assistant.

You will receive:

1. A QUESTION
2. Numbered SOURCE excerpts

Rules:

1. Answer using ONLY information contained in the provided sources.

2. Every factual sentence must include citation markers such as
   [1] or [2][3].

3. If the sources do not contain enough information:
   - set sufficient_context to false
   - keep the answer short
   - explain what information is missing

4. Rate confidence:
   - high = sources directly answer the question
   - medium = sources partially answer the question
   - low = sources barely relate to the question

5. Return ONLY valid JSON.

Required format:

{
  "answer": "answer here",
  "citations_used": [1, 2],
  "confidence": "high",
  "sufficient_context": true
}
"""


# ============================================================
# FORMAT SOURCES
# ============================================================

def _format_sources(chunks: list[dict]) -> str:

    lines = []

    for i, chunk in enumerate(chunks, start=1):

        lines.append(
            f"[{i}] "
            f"(from {chunk.get('source', 'Unknown')}, "
            f"{chunk.get('location', 'Unknown')}):\n"
            f"{chunk.get('text', '')}\n"
        )

    return "\n".join(lines)


# ============================================================
# CALL GROQ
# ============================================================

def _call_llm(question: str, chunks: list[dict]) -> dict:

    # --------------------------------------------------------
    # Check API key
    # --------------------------------------------------------

    if _client is None:

        return {
            "answer": (
                "GROQ_API_KEY is missing. "
                "Add your Groq API key to the .env file."
            ),
            "citations_used": [],
            "confidence": "low",
            "sufficient_context": False,
        }

    # --------------------------------------------------------
    # Check sources
    # --------------------------------------------------------

    if not chunks:

        return {
            "answer": "No relevant sources were found.",
            "citations_used": [],
            "confidence": "low",
            "sufficient_context": False,
        }

    sources_block = _format_sources(chunks)

    user_prompt = f"""
QUESTION:
{question}

SOURCES:
{sources_block}

Return ONLY a valid JSON object.
"""

    # --------------------------------------------------------
    # Call Groq
    # --------------------------------------------------------

    try:

        response = _client.chat.completions.create(

            model=GROQ_MODEL,

            messages=[
                {
                    "role": "system",
                    "content": SYSTEM_PROMPT,
                },
                {
                    "role": "user",
                    "content": user_prompt,
                },
            ],

            temperature=0.2,

            response_format={
                "type": "json_object"
            },

            # Prevent unnecessary reasoning output
            extra_body={
                "include_reasoning": False
            },
        )

    except Exception as e:

        print("\n========== GROQ ERROR ==========")
        print(repr(e))
        print("================================\n")

        return {
            "answer": f"Groq API error: {str(e)}",
            "citations_used": [],
            "confidence": "low",
            "sufficient_context": False,
        }

    # --------------------------------------------------------
    # Get response
    # --------------------------------------------------------

    try:

        raw = response.choices[0].message.content

    except Exception as e:

        print("Invalid Groq response:", repr(e))

        return {
            "answer": "Groq returned an unexpected response.",
            "citations_used": [],
            "confidence": "low",
            "sufficient_context": False,
        }

    # --------------------------------------------------------
    # Parse JSON
    # --------------------------------------------------------

    try:

        parsed = json.loads(raw)

    except json.JSONDecodeError:

        print("Groq returned non-JSON response:")
        print(raw)

        parsed = {
            "answer": raw,
            "citations_used": [],
            "confidence": "low",
            "sufficient_context": False,
        }

    # --------------------------------------------------------
    # Ensure required fields exist
    # --------------------------------------------------------

    parsed.setdefault("answer", "")
    parsed.setdefault("citations_used", [])
    parsed.setdefault("confidence", "low")
    parsed.setdefault("sufficient_context", False)

    return parsed


# ============================================================
# WEB SEARCH FALLBACK
# ============================================================

def _web_search_fallback(
    question: str,
    max_results: int = 4
) -> list[dict]:

    results = []

    try:

        with DDGS() as ddgs:

            for result in ddgs.text(
                question,
                max_results=max_results
            ):

                results.append({

                    "text": result.get(
                        "body",
                        ""
                    ),

                    "source": result.get(
                        "title",
                        "Web result"
                    ),

                    "location": result.get(
                        "href",
                        ""
                    ),

                    "similarity": None,

                })

    except Exception as e:

        print("\n========== WEB SEARCH ERROR ==========")
        print(repr(e))
        print("======================================\n")

    return results


# ============================================================
# MAIN RAG FUNCTION
# ============================================================

def answer_question(question: str) -> dict:

    """
    Main RAG entry point.

    Returns:

    {
        answer,
        confidence,
        sufficient_context,
        used_fallback,
        sources
    }
    """

    # --------------------------------------------------------
    # Validate question
    # --------------------------------------------------------

    if not question or not question.strip():

        return {
            "answer": "Please enter a question.",
            "confidence": "low",
            "sufficient_context": False,
            "used_fallback": False,
            "sources": [],
        }

    # --------------------------------------------------------
    # 1. RETRIEVE
    # --------------------------------------------------------

    try:

        chunks = vectorstore.query(
            question,
            top_k=TOP_K
        )

    except Exception as e:

        print("\n========== VECTOR DB ERROR ==========")
        print(repr(e))
        print("=====================================\n")

        return {
            "answer": "There was a problem searching the knowledge base.",
            "confidence": "low",
            "sufficient_context": False,
            "used_fallback": False,
            "sources": [],
        }

    # --------------------------------------------------------
    # Check retrieval confidence
    # --------------------------------------------------------

    retrieval_confident = (

        bool(chunks)

        and chunks[0].get("similarity") is not None

        and chunks[0]["similarity"] >= SIMILARITY_THRESHOLD

    )

    used_fallback = False

    result = None

    # --------------------------------------------------------
    # 2. GROUND ANSWER IN KNOWLEDGE BASE
    # --------------------------------------------------------

    if chunks and retrieval_confident:

        result = _call_llm(
            question,
            chunks
        )

        needs_fallback = (

            result.get("confidence") == "low"

            or result.get("sufficient_context") is False

        )

    else:

        needs_fallback = True

    # --------------------------------------------------------
    # 3. WEB FALLBACK
    # --------------------------------------------------------

    if needs_fallback:

        web_chunks = _web_search_fallback(question)

        if web_chunks:

            web_result = _call_llm(
                question,
                web_chunks
            )

            result = web_result

            chunks = web_chunks

            used_fallback = True

        elif result is None:

            result = {

                "answer": (
                    "I couldn't find enough information "
                    "in your documents, and the web search "
                    "did not return useful results."
                ),

                "citations_used": [],

                "confidence": "low",

                "sufficient_context": False,

            }

    # --------------------------------------------------------
    # Safety fallback
    # --------------------------------------------------------

    if result is None:

        result = {

            "answer": "Unable to generate an answer.",

            "citations_used": [],

            "confidence": "low",

            "sufficient_context": False,

        }

    # --------------------------------------------------------
    # Build sources
    # --------------------------------------------------------

    sources = []

    for i, chunk in enumerate(
        chunks or [],
        start=1
    ):

        sources.append({

            "index": i,

            "source": chunk.get(
                "source",
                "Unknown"
            ),

            "location": chunk.get(
                "location",
                ""
            ),

            "similarity": chunk.get(
                "similarity"
            ),

        })

    # --------------------------------------------------------
    # Final response
    # --------------------------------------------------------

    return {

        "answer": result.get(
            "answer",
            "No answer generated."
        ),

        "confidence": result.get(
            "confidence",
            "low"
        ),

        "sufficient_context": result.get(
            "sufficient_context",
            False
        ),

        "used_fallback": used_fallback,

        "sources": sources,

    }