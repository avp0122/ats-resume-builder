-- Migration 014: rag_chunks — vector store for the chat RAG corpus.
--
-- Per DECISION 031, the new chat widget grounds answers in retrieved
-- chunks from the blog (5 MDX posts under content/blog/) plus a new
-- support FAQ (content/faq.md). The n8n ingestion workflow chunks
-- each source, asks Next.js for embeddings, then UPSERTs into this
-- table. Inference (/api/chat) does a cosine-similarity top-K search
-- here before calling Groq.
--
-- Why 384-dim:
--   We embed locally with bge-small-en-v1.5 via @huggingface/transformers
--   (zero $ cost, no API dependency). That model's hidden size is 384.
--   Smaller than OpenAI text-embedding-3-small (1536-dim) → smaller
--   HNSW index → faster top-K → fewer Vercel-function CPU-seconds. The
--   retrieval quality on FAQ + blog content is well above the bar.
--
-- Why HNSW over IVFFlat:
--   No training step required (IVFFlat needs `analyze` after enough
--   rows), and it handles tiny corpora cleanly. Our blog + FAQ is
--   maybe ~150 chunks today; we'd never have enough rows to make
--   IVFFlat's pre-clustering worthwhile.
--
-- Why no RLS:
--   The table is read-only-by-server and write-only-by-server (n8n's
--   server-role connection from the ingest workflow, and Next.js's
--   service-role client for /api/chat retrieval). No row is ever
--   touched by a user's session. RLS adds overhead with no benefit
--   in this access pattern. If we ever add per-user chunks (e.g.
--   "remember what you said about my resume"), we'll add RLS then.

create extension if not exists vector;

create table public.rag_chunks (
  id          bigserial primary key,
  -- Stable identifier for the source document. Format conventions:
  --   blog post:   "blog/<slug>"     e.g. "blog/devops-resume-keywords-2026"
  --   FAQ:         "faq"             single document, multiple chunks
  --   future:      "support-tx/<id>" if we ingest resolved support tickets later
  source      text        not null,
  -- 0-based index of this chunk within `source`. Combined with `source`
  -- gives a stable unique key, which means re-ingestion is idempotent —
  -- the n8n workflow re-runs daily and just UPSERTs.
  chunk_idx   int         not null,
  -- The chunk text. Kept verbatim so we can stuff it directly into the
  -- LLM prompt, and so the chat answer can cite the source if needed.
  content     text        not null,
  -- 384-dim normalized embedding produced by bge-small-en-v1.5. Cosine
  -- similarity (= dot product, since vectors are L2-normalized) is the
  -- retrieval metric.
  embedding   vector(384) not null,
  updated_at  timestamptz not null default now(),
  unique (source, chunk_idx)
);

-- HNSW index for fast approximate nearest-neighbor over cosine similarity.
-- Default m + ef_construction work fine at this corpus size. If recall
-- degrades as we grow, tune with `set local hnsw.ef_search = 80` per query
-- rather than rebuilding the index.
create index rag_chunks_embedding_hnsw_idx
  on public.rag_chunks
  using hnsw (embedding vector_cosine_ops);

-- Cheap lookup by source for the ingestion path (delete-then-upsert when
-- a source's chunk count shrinks between runs).
create index rag_chunks_source_idx on public.rag_chunks (source);
