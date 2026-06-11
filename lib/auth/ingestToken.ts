import { NextRequest } from 'next/server';

/**
 * Bearer-token check for the RAG ingest endpoints (/api/rag/sources,
 * /api/rag/embed).
 *
 * Per DECISION 031, the n8n instance that drives ingestion is owned by
 * a partner (different account from the kairesume operator) so we
 * can't rely on shared Supabase staff sessions. We use a long random
 * shared secret instead — set as `RAG_INGEST_TOKEN` env var on Vercel,
 * and as an `httpHeaderAuth` credential in n8n with header
 * "Authorization: Bearer <same-value>".
 *
 * Constant-time compare guards against timing-based discovery. Length
 * mismatch returns false fast (the comparison time is the length of
 * the shorter string, which leaks length only — and the length is
 * fixed in deployment anyway).
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type IngestAuthResult =
  | { ok: true }
  | { ok: false; reason: 'no-token-configured' | 'missing-header' | 'bad-token' };

export function checkIngestToken(request: NextRequest): IngestAuthResult {
  const expected = process.env.RAG_INGEST_TOKEN;
  // Misconfiguration: refusing all requests in this state is correct.
  // The error message in the 503 makes the operator-facing fix obvious.
  if (!expected || expected.length < 24) {
    return { ok: false, reason: 'no-token-configured' };
  }

  const header = request.headers.get('authorization') ?? '';
  // Match "Bearer <token>", case-insensitive on the scheme word.
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return { ok: false, reason: 'missing-header' };

  return constantTimeEqual(m[1].trim(), expected)
    ? { ok: true }
    : { ok: false, reason: 'bad-token' };
}
