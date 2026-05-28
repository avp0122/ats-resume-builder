import { NextRequest, NextResponse } from 'next/server';

/**
 * Render styled HTML → DOCX (Office Open XML) bytes.
 *
 * Why this exists as a server route instead of running in the browser:
 * `@turbodocx/html-to-docx` was forked from a Node-only library and still
 * imports `zlib`, `fs`, `http`, `crypto`, `stream`, etc. at the top of its
 * ESM bundle. Some of those (zlib for the OOXML zip compression) are
 * actually called at runtime, so polyfilling them as empty stubs in the
 * client bundle produces errors like `Cannot read properties of undefined
 * (reading 'Z_SYNC_FLUSH')`. The library's "browser" entry point shipped
 * in v1.20.0 is an IIFE that webpack can't import. See PR #53 / upstream
 * issue https://github.com/turbodocx/html-to-docx/issues/203.
 *
 * Running it server-side sidesteps the entire mess: Node has native zlib,
 * the library works as designed, and the client bundle drops ~1.1 MB.
 *
 * Request body: `{ html: string }` — the fully styled HTML for one document
 * (resume OR cover letter). The caller renders the two HTML payloads
 * separately and POSTs each in parallel.
 *
 * Response: raw DOCX bytes with the OOXML wordprocessing Content-Type.
 *
 * No auth check here on purpose — the route is a pure transform with no
 * side effects (no DB write, no LLM call, no quota). Quota gating already
 * happens upstream in /api/generate; the download button only renders
 * when `usage.downloadAllowed` is true. Rate-limiting can come later if
 * abuse appears.
 */

// Force Node runtime (not Edge). html-to-docx uses zlib/Buffer/etc. which
// only exist in Node.
export const runtime = 'nodejs';

// Resume + cover letter HTML are well under 200 KB combined; a 1 MB cap
// is a generous-but-finite ceiling that protects against a misconfigured
// caller streaming megabytes of HTML at us.
const MAX_HTML_BYTES = 1_000_000;

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const html =
    body && typeof body === 'object' && 'html' in body && typeof (body as any).html === 'string'
      ? (body as any).html
      : null;

  if (!html) {
    return NextResponse.json(
      { error: 'Missing required field "html"' },
      { status: 400 }
    );
  }
  if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) {
    return NextResponse.json(
      { error: `HTML payload exceeds ${MAX_HTML_BYTES} bytes` },
      { status: 413 }
    );
  }

  try {
    // Dynamic import keeps the heavy library out of the route's cold-
    // start path until the first download actually fires.
    const mod = await import('@turbodocx/html-to-docx');
    const HTMLtoDOCX: any = (mod as any).default ?? mod;

    // Same options as the previous client-side call:
    // - Letter / portrait orientation
    // - 1" margins all sides (1440 twips = 1 inch)
    // - Calibri 11pt body text (22 half-points)
    const result = await HTMLtoDOCX(html, undefined, {
      orientation: 'portrait',
      margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      font: 'Calibri',
      fontSize: 22,
    });

    // In Node, html-to-docx returns a Buffer. Return its bytes directly.
    const bytes =
      result instanceof Buffer
        ? result
        : result instanceof Uint8Array
        ? Buffer.from(result)
        : Buffer.from(result as ArrayBuffer);

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Length': String(bytes.byteLength),
        // No filename here — the client picks the filename when building
        // the ZIP. Disposition omitted on purpose.
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[api/docx] render failed:', err);
    return NextResponse.json(
      { error: 'Failed to render DOCX' },
      { status: 500 }
    );
  }
}
