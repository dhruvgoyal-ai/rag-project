# 🧠 Visual RAG Studio & Real-Time Chunking Explainer

[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?style=flat&logo=fastapi)](https://fastapi.tiangolo.com)
[![ChromaDB](https://img.shields.io/badge/ChromaDB-Vector_Store-FF6F00?style=flat)](https://www.trychroma.com)
[![Groq](https://img.shields.io/badge/Groq-Free_LLM_Inference-f55036?style=flat)](https://groq.com)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-Modern_UI-38B2AC?style=flat&logo=tailwind-css)](https://tailwindcss.com)
[![Sentence Transformers](https://img.shields.io/badge/Embeddings-all--MiniLM--L6--v2-blue?style=flat)](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

An interactive, educational **Visual RAG (Retrieval-Augmented Generation) Studio** that demonstrates exactly how document ingestion, sentence-aware chunking, overlap boundary preservation, vector similarity search, citation grounding, and anti-hallucination fallbacks work in real time.

---

## 🌟 Key Features

- **🔬 Real-Time Chunking & Overlap Visualizer:**
  - Watch uploaded PDFs split into sentence-preserving chunks (~900 characters).
  - Visually inspect the **~150-character overlap window** highlighted between consecutive chunks, explaining how context is preserved across splits to eliminate boundary hallucinations.
  - Interactive token/char distribution and 384-dimensional MiniLM vector space telemetry.
- **🧪 Interactive Chunking Sandbox:**
  - Dynamic sliders for **Chunk Size (200 - 2000 chars)** and **Overlap Window (0 - 400 chars)**.
  - Test custom text or built-in presets with instant visual feedback.
- **💬 Citation-Grounded Q&A:**
  - Generates responses with clickable inline citation pills (`[1]`, `[2]`).
  - Clicking any citation automatically scrolls to and highlights the exact reference chunk.
- **🛡️ Anti-Hallucination Pipeline:**
  - Multi-tier confidence scoring (**High / Medium / Low**) based on cosine similarity and model self-rating.
  - Automatic **live web search fallback** (via DuckDuckGo) when local documents lack sufficient context.
- **🎨 Modern Dark UI:**
  - Built with Tailwind CSS, Lucide icons, Marked.js (Markdown), Highlight.js (syntax highlighting), and speech synthesis audio playback.
  - 100% self-contained—zero Node.js/npm build steps required.

---

## 🏗️ Architecture & Pipeline Flow

```
                      ┌──────────────────────────────────────┐
                      │        User Uploads Document         │
                      └──────────────────┬───────────────────┘
                                         │
                                         ▼
                      ┌──────────────────────────────────────┐
                      │    Sentence-Aware Window Chunking    │
                      │  (~900 chars with ~150-char overlap) │
                      └──────────────────┬───────────────────┘
                                         │
                                         ▼
                      ┌──────────────────────────────────────┐
                      │    Local Dense Vector Embeddings     │
                      │       (all-MiniLM-L6-v2 / 384d)      │
                      └──────────────────┬───────────────────┘
                                         │
                                         ▼
                      ┌──────────────────────────────────────┐
                      │    Persistent ChromaDB Vector DB     │
                      │         (HNSW Cosine Space)          │
                      └──────────────────┬───────────────────┘
                                         │
    ┌────────────────────────────────────┴────────────────────────────────────┐
    │                                                                         │
    ▼                                                                         ▼
[User Question]                                                      [Visualizer Studio]
    │                                                                         │
    ▼                                                                • Overlap inspection
Top-k Semantic Retrieval (ChromaDB)                                  • Chunk boundary telemetry
    │                                                                • Live sandbox sliders
    ▼
Cosine Similarity >= Threshold? (0.35)
    ├── NO  ──────────────────────────────────────────┐
    └── YES                                           │
         │                                            │
         ▼                                            ▼
Groq LLM Citation-Grounded Synthesis           Web Fallback (DuckDuckGo)
(Self-evaluates confidence & citations)               │
    │                                                 │
    ├── Confidence is LOW or Insufficient? ───────────┘
    └── Confidence is HIGH / MEDIUM
         │
         ▼
[Grounded Answer with Clickable Citations]
```

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- Python 3.10 or higher
- A free Groq API Key (get one in 30 seconds at [console.groq.com/keys](https://console.groq.com/keys))

### 2. Installation

```bash
# Clone the repository
git clone https://github.com/your-username/rag-agent-project.git
cd rag-agent-project

# Create and activate virtual environment
python -m venv venv

# Windows:
venv\Scripts\activate

# macOS / Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Configure Environment Variables

```bash
# Copy example configuration
cp .env.example .env
```

Open `.env` and insert your Groq API key:
```env
GROQ_API_KEY=gsk_your_groq_api_key_here
GROQ_MODEL=openai/gpt-oss-20b
TOP_K=4
CONFIDENCE_SIMILARITY_THRESHOLD=0.35
```

### 4. Run the Application

```bash
uvicorn main:app --reload
```

Open your browser to **http://localhost:8000**!

---

## ❓ FAQ: Do I Need to Make It Live Before Uploading to GitHub?

> **Short Answer: No!**
>
> GitHub is a source code and project portfolio platform. Developers, recruiters, and engineering teams review your repository to see:
> 1. Clean code architecture and Python best practices.
> 2. Clear visual documentation and interactive explanations.
> 3. Proper `.gitignore` and security hygiene.
>
> Running the project locally (`http://localhost:8000`) is standard. 
> 
> *Optional Bonus:* If you would like non-technical users to try your app directly in their browser without installing Python, you can deploy it to **Hugging Face Spaces** (free Docker/FastAPI container) or **Render** (free web service).

---

## 📤 Safe GitHub Push Instructions

Ensure your secrets and local databases are protected before pushing to GitHub:

```bash
# 1. Initialize git (if not already done)
git init

# 2. Check status (make sure .env and chroma_db/ are NOT listed thanks to .gitignore)
git status

# 3. Stage all safe files
git add .

# 4. Commit your project
git commit -m "feat: visual RAG studio with real-time chunking, overlap inspection, and citation grounding"

# 5. Link your GitHub repository and push
git branch -M main
git remote add origin https://github.com/your-username/your-repo-name.git
git push -u origin main
```

---

## 🌐 Optional: Deploying Live for Free

If you want a live public URL to share on your resume or portfolio:

### Option A: Hugging Face Spaces (Recommended for ML/AI)
1. Create a free account at [huggingface.co](https://huggingface.co).
2. Create a new Space, choose **Docker** or **Gradio/FastAPI**.
3. In Space Settings, add your secret `GROQ_API_KEY`.
4. Push your repository to Hugging Face—it builds and hosts for free with public HTTPS!

### Option B: Render.com
1. Create a free Web Service at [render.com](https://render.com).
2. Connect your GitHub repository.
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. In Environment Variables, add `GROQ_API_KEY`.

---

## 📁 Project Structure

```
rag-agent-project/
├── main.py              # FastAPI endpoints (/upload, /ask, /preview-chunking, /documents, /chunks)
├── ingestion.py         # PDF/Text loader, sentence-aware chunker, and overlap telemetry
├── vectorstore.py       # ChromaDB wrapper, local MiniLM embeddings (384d), cosine search
├── rag_pipeline.py      # LLM citation grounding, confidence heuristics, DuckDuckGo fallback
├── static/
│   ├── index.html       # Visual studio UI (Tailwind CSS, Marked.js, Lucide Icons)
│   ├── app.js           # Interactive state, chunking visualizer, overlap highlighter
│   └── style.css        # Glassmorphism, animations, citation pulse, overlap styling
├── data/                # Upload directory (.gitkeep included, actual files gitignored)
├── requirements.txt     # Python dependencies
├── .env.example         # Environment template
└── .gitignore           # Safeguards secrets, chroma_db, and caches
```

---

## ⚙️ Configuration & Tuning

Edit `.env`:
- `GROQ_MODEL`: Change model (e.g. `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, `openai/gpt-oss-20b`).
- `TOP_K`: Number of chunks retrieved per query (default: `4`).
- `CONFIDENCE_SIMILARITY_THRESHOLD`: Retrieval cutoff below which fallback triggers (default: `0.35`).

---

## 📄 License

MIT License. Free for personal, academic, and commercial use.
