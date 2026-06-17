-- Migration 016: match_rag_chunks — cosine top-K retrieval for /api/chat.
--
-- Per DECISION 031, inference (/api/chat, PR 3) does a cosine-similarity
-- top-K search over rag_chunks before calling Groq. supabase-js can't
-- express "ORDER BY embedding <=> $query LIMIT k" through PostgREST, so we
-- expose it as an RPC the service-role client calls with .rpc().
--
-- Distance operator:
--   `<=>` is pgvector's cosine-distance operator (matches the
--   vector_cosine_ops HNSW index from migration 014). similarity =
--   1 - distance, so 1.0 is identical, 0.0 is orthogonal. The HNSW index
--   is used automatically for the ORDER BY ... LIMIT shape.
--
-- match_count is clamped 1..20 inside the function so a caller (or a
-- tampered request) can't ask for an unbounded scan.

create or replace function public.match_rag_chunks(
  query_embedding vector(384),
  match_count int default 6
)
returns table (
  id        bigint,
  source    text,
  chunk_idx int,
  content   text,
  similarity float
)
language sql
stable
as $$
  select
    rc.id,
    rc.source,
    rc.chunk_idx,
    rc.content,
    1 - (rc.embedding <=> query_embedding) as similarity
  from public.rag_chunks rc
  order by rc.embedding <=> query_embedding
  limit greatest(1, least(coalesce(match_count, 6), 20));
$$;

-- The function reads a server-only table (no RLS, see migration 014) and is
-- only ever invoked by the service-role client in /api/chat. Lock down the
-- public roles so it isn't reachable from an anon/auth PostgREST session.
revoke all on function public.match_rag_chunks(vector, int) from public;
revoke all on function public.match_rag_chunks(vector, int) from anon, authenticated;
