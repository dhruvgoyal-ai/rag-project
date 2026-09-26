# Visual RAG Studio

A simple RAG project that lets you upload documents, search them using semantic similarity, and get answers with citations.

It also includes a small visualizer to understand how text is split into chunks and how overlap works.

## Features

* PDF/Text document upload
* Sentence-based chunking with overlap
* ChromaDB for vector search
* MiniLM embeddings
* Groq LLM for answers
* Citation-based responses
* Confidence checking
* Web search fallback
* Simple chunking visualizer

## Tech Stack

* Python
* FastAPI
* ChromaDB
* Sentence Transformers
* Groq
* Tailwind CSS

## Run Locally

```bash
git clone https://github.com/dhruvgoyal-ai/rag-project.git
cd rag-project

python -m venv venv
venv\Scripts\activate

pip install -r requirements.txt
```

Create a `.env` file:

```env
GROQ_API_KEY=your_api_key
GROQ_MODEL=openai/gpt-oss-20b
```

Run:

```bash
uvicorn main:app --reload
```

Then open:

```text
http://localhost:8000
```

## Project Structure

```text
rag-project/
├── main.py
├── ingestion.py
├── vectorstore.py
├── rag_pipeline.py
├── static/
├── data/
├── requirements.txt
├── .env.example
└── .gitignore
```

## License

MIT
