import fs from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { listSlugs, getPost } from '@/lib/blog';
import { checkIngestToken } from '@/lib/auth/ingestToken';

/**
 * GET /api/rag/sources
 *
 * Bearer-token-protected. Returns all source documents the chat RAG
 * indexes — currently the 5 blog posts under content/blog/ and the
 * single content/faq.md. n8n's ingest workflow calls this once per
 * scheduled run, then chunks + embeds the result.
 *
 * Why this lives in the app (not n8n directly reading the repo):
 *   - n8n can't browse the Vercel filesystem; the alternative would be
 *     GitHub raw-content URLs, but that means n8n is reading the latest
 *     commit on master instead of "whatever is currently deployed",
 *     which would cause stale-content drift the moment a deploy gets
 *     rolled back. Reading from /api/rag/sources guarantees n8n indexes
 *     exactly what's live.
 *
 * Response shape: { sources: [{ source, content }] }
 *   - source: stable identifier used as the `source` column in
 *     rag_chunks, e.g. "blog/devops-resume-keywords-2026" or "faq"
 *   - content: raw markdown (with frontmatter intact; the chunker
 *     strips it before chunking)
 *
 * Auth failure responses:
 *   - 503 if RAG_INGEST_TOKEN isn't set on the server (operator-fixable
 *     misconfiguration; clearer than a 401 here)
 *   - 401 for missing or wrong bearer token
 */

export const runtime = 'nodejs';

// 5 minutes — we're reading the filesystem, but the actual content is
// versioned with the deployment, so it can only change on a new deploy
// anyway. This cuts repeated-call work to a no-op.
export const revalidate = 300;

interface SourcePayload {
  source: string;
  content: string;
}

async function loadFaq(): Promise<SourcePayload | null> {
  const file = path.join(process.cwd(), 'content', 'faq.md');
  try {
    const content = await fs.readFile(file, 'utf8');
    return { source: 'faq', content };
  } catch {
    // FAQ file optional — if it's not in the deployment we just skip it.
    return null;
  }
}

async function loadBlogPosts(): Promise<SourcePayload[]> {
  const slugs = await listSlugs();
  const posts = await Promise.all(slugs.map((slug) => getPost(slug)));
  return posts
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .map((p) => ({ source: `blog/${p.slug}`, content: p.body }));
}

export async function GET(request: NextRequest) {
  const auth = checkIngestToken(request);
  if (!auth.ok) {
    if (auth.reason === 'no-token-configured') {
      return NextResponse.json(
        {
          error:
            'RAG_INGEST_TOKEN is not set on this deployment. Configure it in Vercel env vars before n8n can ingest.',
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [faq, posts] = await Promise.all([loadFaq(), loadBlogPosts()]);
  const sources: SourcePayload[] = [];
  if (faq) sources.push(faq);
  sources.push(...posts);

  return NextResponse.json({
    sources,
    count: sources.length,
    // Useful for n8n to log on every run so we can verify the ingest is
    // seeing the latest content after a deploy.
    deploy_id: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
  });
}
