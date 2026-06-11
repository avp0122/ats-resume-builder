/**
 * Markdown-aware chunker for the RAG ingestion pipeline.
 *
 * Strategy:
 *   1. Split the document on `##` headings (h2 boundaries). This gives
 *      us a "one Q&A per chunk" shape for content/faq.md (each FAQ
 *      entry is an h2) and a "one section per chunk" shape for blog
 *      posts (which use h2 for major sections).
 *   2. If any heading-section is still longer than the target window
 *      (TARGET_CHARS), split it further on paragraph boundaries with
 *      sliding overlap. This handles long-form blog posts cleanly.
 *   3. Drop chunks that are mostly punctuation / boilerplate (<40 char
 *      of letters after stripping markdown) — keeps the index clean.
 *
 * Sizing:
 *   We work in characters because that's what we have without running
 *   the tokenizer. The conversion is roughly 3.5 chars per token, so a
 *   2800-char window ≈ 800 tokens — well under any embedding model's
 *   context cap and a good retrieval granularity. 400-char overlap
 *   means ~100 tokens of overlap across boundaries.
 *
 * No dependency on @huggingface/transformers' tokenizer here: this
 * runs in the request handler ahead of embedding, so keeping it
 * synchronous + dep-free keeps the embed route fast.
 */

const TARGET_CHARS = 2800;
const OVERLAP_CHARS = 400;
const MIN_LETTERS_PER_CHUNK = 40;

export interface SourceDoc {
  /** Stable identifier like "blog/devops-resume-keywords-2026" or "faq". */
  source: string;
  /** Raw markdown content. */
  content: string;
}

export interface Chunk {
  source: string;
  /** 0-based index within `source`. Stable across re-runs as long as the document order doesn't change. */
  chunk_idx: number;
  content: string;
}

/**
 * Strip frontmatter (the YAML block between `---` fences at the top of
 * a markdown file) so embeddings reflect the prose, not the metadata.
 * Blog posts have frontmatter; the FAQ doesn't — both code paths are
 * fine because we only strip when the file actually starts with `---`.
 */
function stripFrontmatter(md: string): string {
  if (!md.startsWith('---')) return md;
  const end = md.indexOf('\n---', 3);
  if (end === -1) return md;
  return md.slice(end + 4).replace(/^\s+/, '');
}

/**
 * Split a long string at the nearest paragraph boundary at-or-before the
 * target index. Falls back to a hard cut if there's no double-newline
 * within reach (rare in real prose).
 */
function paragraphSplit(text: string, target: number): number {
  if (text.length <= target) return text.length;
  const window = text.slice(0, target);
  const paragraphCut = window.lastIndexOf('\n\n');
  if (paragraphCut > target * 0.6) return paragraphCut + 2;
  const sentenceCut = window.lastIndexOf('. ');
  if (sentenceCut > target * 0.6) return sentenceCut + 2;
  return target;
}

/**
 * Sliding-window subdivision of an oversized section into ~TARGET_CHARS
 * pieces with OVERLAP_CHARS of overlap. The first chunk starts at 0;
 * subsequent chunks start `TARGET_CHARS - OVERLAP_CHARS` further in.
 */
function subdivideLongSection(text: string): string[] {
  if (text.length <= TARGET_CHARS) return [text];
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    const end = i + paragraphSplit(text.slice(i), TARGET_CHARS);
    out.push(text.slice(i, end).trim());
    if (end >= text.length) break;
    i = Math.max(end - OVERLAP_CHARS, i + 1);
  }
  return out;
}

/**
 * Count letters (a-z, A-Z) after stripping common markdown noise. Used
 * to filter out chunks that are pure code blocks, link soup, or table
 * separators — those don't embed usefully.
 */
function letterCount(s: string): number {
  return (s.match(/[A-Za-z]/g) ?? []).length;
}

export function chunkMarkdown(doc: SourceDoc): Chunk[] {
  const body = stripFrontmatter(doc.content);

  // Split on `\n## ` boundaries (h2 headings). The first piece (before
  // the first ##) is the document preamble — usually a one-paragraph
  // intro on blog posts; we treat it as its own chunk if non-trivial.
  // `^## ` (start-of-file h2) is also matched.
  const sections = body
    .split(/\n(?=## )/)
    .map((s) => s.trim())
    .filter(Boolean);

  const pieces: string[] = [];
  for (const section of sections) {
    pieces.push(...subdivideLongSection(section));
  }

  const out: Chunk[] = [];
  let chunkIdx = 0;
  for (const piece of pieces) {
    if (letterCount(piece) < MIN_LETTERS_PER_CHUNK) continue;
    out.push({
      source: doc.source,
      chunk_idx: chunkIdx++,
      content: piece,
    });
  }
  return out;
}

export function chunkMany(docs: SourceDoc[]): Chunk[] {
  return docs.flatMap(chunkMarkdown);
}
