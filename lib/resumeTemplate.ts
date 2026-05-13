import type { PersonalInfo } from './llm';

// A4 PDF rendering: jsPDF page is 210mm wide. With the 12mm left/right
// margin we set in html2pdf options, the actual content area is 186mm.
// At 96dpi that's ~703px. The wrapper MUST match the content area, not
// the full page — otherwise html2canvas captures a wider image which
// jsPDF then tries to scale into the smaller area, clipping the right
// side and creating an asymmetric left/right margin.
const PDF_WIDTH_PX = 703;
// jsPDF margins handle the page edges, so the template only adds a small
// top/bottom buffer for the very first/last page's start.
const PDF_PADDING = '0';
const PREVIEW_PADDING = '32px 36px';

/**
 * Render a polished, ATS-friendly resume document (single column, no graphics).
 *
 * Inline styles are mandatory because html2canvas (used by html2pdf) snapshots
 * computed styles. The wrapper has an explicit pixel width so the document is
 * rendered correctly even when the wrapper is positioned off-screen.
 */
export function renderResumeDocument(
  personalInfo: PersonalInfo,
  bodyHtml: string,
  variant: 'preview' | 'pdf' = 'pdf'
): string {
  const isPdf = variant === 'pdf';
  const widthStyle = isPdf ? `width:${PDF_WIDTH_PX}px;` : 'width:100%;max-width:760px;';
  const padding = isPdf ? PDF_PADDING : PREVIEW_PADDING;

  return `
<div class="kairesume-doc" style="
  ${widthStyle}
  margin:0 auto;
  padding:${padding};
  background:#ffffff;
  color:#0f172a;
  font-family:'Inter','Helvetica Neue',Arial,sans-serif;
  font-size:11pt;
  line-height:1.5;
  box-sizing:border-box;
  overflow-wrap:anywhere;
  word-break:break-word;
">
  ${renderResumeHeader(personalInfo)}
  <main style="margin-top:18px;">
    ${styleResumeBody(bodyHtml)}
  </main>
</div>
`;
}

/**
 * Render a cover letter as a plain business letter — date, body paragraphs,
 * and a "Sincerely, [Name]" sign-off. Intentionally minimal: no header,
 * no contact block. The sender's identity is the signature at the bottom.
 */
export function renderCoverLetterDocument(
  personalInfo: PersonalInfo,
  bodyHtml: string,
  variant: 'preview' | 'pdf' = 'pdf'
): string {
  const isPdf = variant === 'pdf';
  const widthStyle = isPdf ? `width:${PDF_WIDTH_PX}px;` : 'width:100%;max-width:760px;';
  const padding = isPdf ? PDF_PADDING : PREVIEW_PADDING;
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const signerName = (personalInfo.fullName || '').trim();

  return `
<div class="kairesume-doc" style="
  ${widthStyle}
  margin:0 auto;
  padding:${padding};
  background:#ffffff;
  color:#0f172a;
  font-family:'Inter','Helvetica Neue',Arial,sans-serif;
  font-size:11pt;
  line-height:1.65;
  box-sizing:border-box;
  overflow-wrap:anywhere;
  word-break:break-word;
">
  <p style="margin:0 0 24px;color:#475569;font-size:10.5pt;">${escapeHtml(today)}</p>
  <main>${styleCoverBody(bodyHtml)}</main>
  <div style="margin-top:24px;color:#1e293b;line-height:1.7;">
    <p style="margin:0 0 36px;">Sincerely,</p>
    ${signerName ? `<p style="margin:0;font-weight:600;color:#0f172a;">${escapeHtml(signerName)}</p>` : ''}
  </div>
</div>
`;
}

function renderResumeHeader(p: PersonalInfo): string {
  const name = (p.fullName || 'Your Name').trim();
  const contactBits = [p.email, p.phone, p.location].filter(Boolean).map(escapeHtml);
  const links = Object.entries(p.socialLinks || {})
    .filter(([, v]) => Boolean(v))
    .map(([k, v]) => {
      const url = v as string;
      const display = displayUrl(url);
      // Show the readable URL itself (not just the label) so it survives in
      // printed PDFs where embedded hyperlinks are easy to miss. The href
      // still works in PDFs that support links.
      return `<a href="${escapeAttr(url)}" style="color:#4f46e5;text-decoration:none;">${escapeHtml(display)}</a>`;
    });

  return `
<header style="border-bottom:2px solid #4f46e5;padding-bottom:12px;">
  <h1 style="
    margin:0;
    font-size:24pt;
    font-weight:700;
    letter-spacing:-0.01em;
    color:#0f172a;
    line-height:1.15;
  ">${escapeHtml(name)}</h1>
  ${
    contactBits.length
      ? `<div style="margin-top:6px;color:#475569;font-size:10pt;">${contactBits.join('  ·  ')}</div>`
      : ''
  }
  ${
    links.length
      ? `<div style="margin-top:4px;font-size:10pt;color:#475569;">${links.join('  ·  ')}</div>`
      : ''
  }
</header>`;
}

/**
 * Strip protocol + trailing slash so URLs read cleanly on a printed page.
 *   https://www.linkedin.com/in/foo/  →  linkedin.com/in/foo
 */
function displayUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
}

function styleResumeBody(html: string): string {
  // page-break-inside:avoid keeps headings + bullets from splitting awkwardly
  // across PDF pages.
  return html
    .replace(
      /<h2(\b[^>]*)>/g,
      `<h2$1 style="margin:18px 0 6px;font-size:12.5pt;font-weight:700;color:#4f46e5;text-transform:uppercase;letter-spacing:0.08em;border-bottom:1px solid #e2e8f0;padding-bottom:4px;page-break-after:avoid;break-after:avoid;">`
    )
    .replace(
      /<h3(\b[^>]*)>/g,
      `<h3$1 style="margin:10px 0 2px;font-size:11.5pt;font-weight:600;color:#0f172a;page-break-after:avoid;break-after:avoid;">`
    )
    .replace(
      /<p(\b[^>]*)>/g,
      `<p$1 style="margin:0 0 8px;color:#1e293b;line-height:1.55;page-break-inside:avoid;break-inside:avoid;">`
    )
    .replace(
      /<ul(\b[^>]*)>/g,
      `<ul$1 style="margin:4px 0 10px;padding-left:18px;">`
    )
    .replace(
      /<li(\b[^>]*)>/g,
      `<li$1 style="margin:0 0 4px;color:#1e293b;line-height:1.5;page-break-inside:avoid;break-inside:avoid;">`
    )
    .replace(
      /<strong(\b[^>]*)>/g,
      `<strong$1 style="color:#0f172a;font-weight:600;">`
    );
}

function styleCoverBody(html: string): string {
  // Cover letter uses minimal styling — just consistent paragraph spacing,
  // and avoid splitting a paragraph across pages.
  return html
    .replace(
      /<p(\b[^>]*)>/g,
      `<p$1 style="margin:0 0 14px;color:#1e293b;line-height:1.7;page-break-inside:avoid;break-inside:avoid;">`
    )
    .replace(
      /<strong(\b[^>]*)>/g,
      `<strong$1 style="color:#0f172a;font-weight:600;">`
    );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;');
}
