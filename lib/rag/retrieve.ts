import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * Query-time retrieval for the chat RAG (DECISION 031, PR 3).
 *
 * Two hops:
 *   1. Embed the user's question via the Supabase Edge Function
 *      (`/functions/v1/embed`, gte-small, 384-dim). Same bearer secret
 *      (RAG_INGEST_TOKEN) the n8n ingest workflow uses — the function was
 *      deployed `--no-verify-jwt`, so the bearer is the only auth.
 *   2. Cosine top-K over rag_chunks via the match_rag_chunks RPC
 *      (migration 016), using the service-role client (the table is
 *      server-only, no RLS — see migration 014).
 *
 * Callers should treat failures as non-fatal: if the embed function or the
 * RPC errors (e.g. infra not yet provisioned), /api/chat answers without
 * grounding rather than 500-ing.
 */

const EMBED_DIM = 384;
// gte-small truncates long inputs anyway; a question is short, but cap
// defensively so a pasted job description can't blow the Edge Function's
// 4000-char-per-input limit.
const MAX_QUERY_CHARS = 2000;

export interface RetrievedChunk {
  source: string;
  content: string;
  similarity: number;
}

function embedEndpoint(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL not set');
  return `${url.replace(/\/+$/, '')}/functions/v1/embed`;
}

/** Embed a single query string → 384-dim vector. Throws on any failure. */
export async function embedQuery(text: string): Promise<number[]> {
  const token = process.env.RAG_INGEST_TOKEN;
  if (!token) throw new Error('RAG_INGEST_TOKEN not set');

  const res = await fetch(embedEndpoint(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ inputs: [text.slice(0, MAX_QUERY_CHARS)] }),
    // Don't let a cold Edge Function hang the whole chat request.
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`embed function ${res.status}: ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as { vectors?: unknown };
  const vec = Array.isArray(data.vectors) ? data.vectors[0] : undefined;
  if (!Array.isArray(vec) || vec.length !== EMBED_DIM) {
    throw new Error('embed function returned an unexpected vector shape');
  }
  return vec as number[];
}

/**
 * Retrieve the top-K most similar chunks for `query`. Returns [] if the
 * corpus is empty. Throws if embedding or the RPC fails — the caller
 * (/api/chat) catches and degrades gracefully.
 */
export async function retrieveContext(
  query: string,
  k = 6
): Promise<RetrievedChunk[]> {
  const queryEmbedding = await embedQuery(query);
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc('match_rag_chunks', {
    query_embedding: queryEmbedding,
    match_count: k,
  });
  if (error) throw new Error(`match_rag_chunks RPC failed: ${error.message}`);
  return (data ?? []) as RetrievedChunk[];
}
