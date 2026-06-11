// supabase/functions/embed — embed text → 384-dim vector via Supabase.ai.
//
// Deploy:
//   npx supabase functions deploy embed --no-verify-jwt
//
// Set the shared secret (the same RAG_INGEST_TOKEN that's on Vercel):
//   npx supabase secrets set RAG_INGEST_TOKEN=<same-32-byte-hex>
//
// Why this runs on Supabase instead of in our Vercel function:
//   `@huggingface/transformers` (the obvious local-embeddings choice) pulls
//   in onnxruntime-node (~513 MB), which blows past Vercel's 250 MB
//   serverless function size limit. Supabase Edge Functions ship with a
//   built-in `Supabase.ai.Session('gte-small')` API that runs gte-small
//   (384-dim, same dimension as bge-small-en-v1.5) on Supabase's
//   infrastructure. Free on Supabase free tier (500K invocations/month).
//
// Request:   POST  Authorization: Bearer <RAG_INGEST_TOKEN>
//                  Content-Type: application/json
//                  { "inputs": string[] }   // up to 64 per call
// Response:  200   { "vectors": number[][], "model": "gte-small", "dim": 384 }
//
// Why bearer-auth even though Edge Functions can be public:
//   The Edge Function is reachable from anywhere on the internet by URL.
//   Without auth a third party could burn through our free-tier
//   invocation budget. The same RAG_INGEST_TOKEN gates both this function
//   and /api/rag/sources on kairesume, so callers (n8n + future
//   /api/chat) only need one secret.

// deno-lint-ignore-file no-explicit-any
// @ts-ignore — Deno globals available at runtime.
declare const Deno: { env: { get(name: string): string | undefined } };
// @ts-ignore — Supabase.ai is injected into the Edge Function runtime.
declare const Supabase: { ai: { Session: new (model: string) => any } };

const MODEL = 'gte-small';
const EMBED_DIM = 384;
const MAX_BATCH = 64;
const MAX_CHARS_PER_INPUT = 4_000;

// Lazy-init the session at module scope. Edge Function instances persist
// across warm invocations, so the same session serves many requests
// without re-initialising.
let sessionPromise: Promise<any> | null = null;
function getSession(): Promise<any> {
  if (!sessionPromise) {
    sessionPromise = Promise.resolve(new Supabase.ai.Session(MODEL));
  }
  return sessionPromise;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request): Promise<Response> => {
  // Health check / warm-up — preloads the model session into memory so
  // a subsequent POST doesn't pay the first-call cost. Same pattern as
  // the old Next.js GET /api/rag/embed. Public (no auth).
  if (req.method === 'GET') {
    try {
      await getSession();
      return jsonResponse({ ok: true, model: MODEL, dim: EMBED_DIM });
    } catch (err) {
      console.error('[embed] warm-up failed:', err);
      return jsonResponse({ error: 'Warm-up failed' }, 500);
    }
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  // Bearer auth via shared secret. Set with:
  //   supabase secrets set RAG_INGEST_TOKEN=<value>
  const expected = Deno.env.get('RAG_INGEST_TOKEN') ?? '';
  if (expected.length < 24) {
    return jsonResponse(
      {
        error:
          'RAG_INGEST_TOKEN secret is not set on this Supabase project. Set it with `supabase secrets set RAG_INGEST_TOKEN=...`.',
      },
      503
    );
  }

  const auth = req.headers.get('authorization') ?? '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m || !constantTimeEqual(m[1].trim(), expected)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  if (!body || !Array.isArray(body.inputs)) {
    return jsonResponse({ error: 'Body must be { inputs: string[] }' }, 400);
  }
  if (body.inputs.length === 0) {
    return jsonResponse({ vectors: [], model: MODEL, dim: EMBED_DIM });
  }
  if (body.inputs.length > MAX_BATCH) {
    return jsonResponse(
      { error: `Batch size ${body.inputs.length} exceeds maximum ${MAX_BATCH}. Split the request.` },
      413
    );
  }
  for (let i = 0; i < body.inputs.length; i++) {
    const v = body.inputs[i];
    if (typeof v !== 'string') {
      return jsonResponse({ error: `inputs[${i}] is not a string` }, 400);
    }
    if (v.length > MAX_CHARS_PER_INPUT) {
      return jsonResponse(
        {
          error: `inputs[${i}] is ${v.length} chars; max ${MAX_CHARS_PER_INPUT}. Pre-chunk your text.`,
        },
        413
      );
    }
  }

  try {
    const session = await getSession();
    const vectors: number[][] = [];
    // Supabase.ai.Session('gte-small').run() takes one string at a time.
    // We loop sequentially — the session is in-process so the per-call
    // overhead is low, and parallel calls would just contend on the same
    // shared model state.
    for (const input of body.inputs) {
      const vec = await session.run(input, { mean_pool: true, normalize: true });
      vectors.push(Array.isArray(vec) ? vec : Array.from(vec as ArrayLike<number>));
    }
    return jsonResponse({ vectors, model: MODEL, dim: EMBED_DIM });
  } catch (err) {
    console.error('[embed] embedding failed:', err);
    return jsonResponse({ error: 'Failed to embed' }, 500);
  }
});
