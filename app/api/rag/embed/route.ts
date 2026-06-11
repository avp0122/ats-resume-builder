import { NextRequest, NextResponse } from 'next/server';
import { embed, EMBED_DIM, EMBED_MODEL_ID, warmEmbedder } from '@/lib/rag/embed';
import { checkIngestToken } from '@/lib/auth/ingestToken';

/**
 * POST /api/rag/embed
 *
 * Bearer-token-protected. Accepts a batch of strings and returns one
 * 384-dim normalized vector per input. Same shape n8n calls during
 * ingestion AND that /api/chat will call for query embedding (both
 * hit the same Vercel function so the loaded model serves both).
 *
 * Body:    { inputs: string[] }    (max 64 per call, max 4 KB per string)
 * Returns: { vectors: number[][], model: string, dim: number }
 *
 * GET /api/rag/embed
 *
 * Warm-up ping. No body, no auth (it's a side-effect-free no-op that
 * just kicks the model load). Useful for n8n's "first step before
 * batch embed" trick — call GET, wait for 200, then start POSTing
 * batches. Avoids the first POST timing out on the model download.
 *
 * Why no auth on GET:
 *   The endpoint does nothing but allocate memory inside this server
 *   instance. There's no data leak, no abuse vector beyond using
 *   our compute — which is already gated by Vercel's per-deployment
 *   limits.
 *
 * Why we cap to 64 inputs per batch:
 *   bge-small-en-v1.5 (quantized) memory roughly doubles with batch
 *   size at the attention matrices. 64 keeps us comfortably under
 *   1 GB resident on the Vercel function. n8n can split larger
 *   payloads across multiple calls — the wall-clock difference is
 *   small because the model stays warm between calls.
 */

export const runtime = 'nodejs';
// Embedding 64 strings on a cold start (model download + first inference)
// can take 15-25 seconds. Vercel Hobby's default 10s is too tight; 60s
// is the Hobby ceiling and gives us comfortable headroom.
export const maxDuration = 60;

const MAX_BATCH = 64;
const MAX_CHARS_PER_INPUT = 4_000;

export async function GET() {
  // Kick off the load if it hasn't happened yet. The promise is cached
  // module-side so concurrent callers all wait on the same load.
  await warmEmbedder();
  return NextResponse.json({
    ok: true,
    model: EMBED_MODEL_ID,
    dim: EMBED_DIM,
  });
}

export async function POST(request: NextRequest) {
  const auth = checkIngestToken(request);
  if (!auth.ok) {
    if (auth.reason === 'no-token-configured') {
      return NextResponse.json(
        {
          error:
            'RAG_INGEST_TOKEN is not set on this deployment. Configure it in Vercel env vars first.',
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const inputs =
    body && typeof body === 'object' && 'inputs' in body && Array.isArray((body as any).inputs)
      ? ((body as any).inputs as unknown[])
      : null;

  if (!inputs) {
    return NextResponse.json(
      { error: 'Body must be { inputs: string[] }' },
      { status: 400 }
    );
  }
  if (inputs.length === 0) {
    return NextResponse.json({ vectors: [], model: EMBED_MODEL_ID, dim: EMBED_DIM });
  }
  if (inputs.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `Batch size ${inputs.length} exceeds maximum ${MAX_BATCH}. Split the request.` },
      { status: 413 }
    );
  }
  for (let i = 0; i < inputs.length; i++) {
    const v = inputs[i];
    if (typeof v !== 'string') {
      return NextResponse.json(
        { error: `inputs[${i}] is not a string` },
        { status: 400 }
      );
    }
    if (v.length > MAX_CHARS_PER_INPUT) {
      return NextResponse.json(
        {
          error: `inputs[${i}] is ${v.length} chars; max ${MAX_CHARS_PER_INPUT}. Pre-chunk your text.`,
        },
        { status: 413 }
      );
    }
  }

  try {
    const vectors = await embed(inputs as string[]);
    return NextResponse.json({ vectors, model: EMBED_MODEL_ID, dim: EMBED_DIM });
  } catch (err) {
    console.error('[api/rag/embed] embedding failed:', err);
    return NextResponse.json({ error: 'Failed to embed' }, { status: 500 });
  }
}
