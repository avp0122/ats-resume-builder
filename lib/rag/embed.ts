/**
 * Local embedding via @huggingface/transformers.
 *
 * Model: Xenova/bge-small-en-v1.5
 *   - 384-dim, L2-normalized output (cosine similarity = dot product)
 *   - quantized ONNX (~30 MB on disk, ~80 MB resident)
 *   - free: weights fetch from Hugging Face's public CDN on first use
 *     and cache in /tmp on Vercel (persists across warm invocations,
 *     gone on cold start)
 *
 * Cost: $0 today, $0 forever as long as we stay on free CDN downloads
 * and Vercel-Hobby compute. No API key required, no usage metering.
 *
 * Loaded lazily on first call inside a single process so the model
 * never adds latency to requests that don't touch RAG. The promise is
 * cached at module scope so concurrent first-callers all wait on the
 * same load.
 */

// Type-only-ish: we keep the value as `any` so this module type-checks
// before the package is added to node_modules. Once installed the real
// types take over at runtime.
type Pipeline = (
  texts: string | string[],
  options?: { pooling?: 'mean' | 'cls'; normalize?: boolean }
) => Promise<{ data: Float32Array; dims: number[] }>;

const MODEL_ID = 'Xenova/bge-small-en-v1.5';
const EMBEDDING_DIM = 384;

let embedderPromise: Promise<Pipeline> | null = null;

async function loadEmbedder(): Promise<Pipeline> {
  // Dynamic import so the heavy library isn't pulled into the Edge
  // bundle when a route that imports this module happens to also be
  // edge-compatible. We always want Node runtime for embedding calls.
  const { pipeline, env } = await import('@huggingface/transformers');

  // Prefer the bundled WASM backend in serverless; trying to use the
  // ONNX-via-native build fails on Vercel's read-only FS.
  env.allowLocalModels = false;
  env.useBrowserCache = false;

  return (await pipeline('feature-extraction', MODEL_ID, {
    // bge-small-en-v1.5 has both fp32 and int8 variants; the quantized
    // one is the default and is what we want for serverless memory limits.
    dtype: 'q8',
  })) as unknown as Pipeline;
}

/**
 * Ensure the model is loaded. Call from a low-priority warm-up route
 * to avoid paying the load cost during a user-facing request.
 */
export async function warmEmbedder(): Promise<void> {
  if (!embedderPromise) embedderPromise = loadEmbedder();
  await embedderPromise;
}

/**
 * Embed a batch of texts. Returns one 384-dim normalized vector per
 * input, in the same order. Inputs longer than the model's 512-token
 * context get truncated by the tokenizer — that's fine for our chunks
 * (capped at ~800 tokens of source text, of which the first 512 are
 * the most semantically loaded).
 *
 * Batch size: pass up to ~64 strings at a time. Larger batches save
 * per-call overhead but spike memory; 64 has worked cleanly in
 * sentence-transformers benchmarks at this model size.
 */
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (!embedderPromise) embedderPromise = loadEmbedder();
  const embedder = await embedderPromise;

  const result = await embedder(texts, { pooling: 'mean', normalize: true });
  // `result.data` is a flat Float32Array of length texts.length * 384.
  // Slice into per-text vectors. Convert from typed array to plain
  // number[] for JSON-serializability over the HTTP boundary.
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i++) {
    const start = i * EMBEDDING_DIM;
    vectors.push(Array.from(result.data.slice(start, start + EMBEDDING_DIM)));
  }
  return vectors;
}

export const EMBED_MODEL_ID = MODEL_ID;
export const EMBED_DIM = EMBEDDING_DIM;
