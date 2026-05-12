import type { PersonalInfo } from './llm';

const PDF_WIDTH_PX = 816; // 8.5in × 96dpi — matches html2canvas/letter portrait
const PDF_PADDING = '48px 56px';
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
<div class="kresume-doc" style="
  ${widthStyle}
  margin:0 auto;
  padding:${padding};
  background:#ffffff;
  color:#0f172a;
  font-family:'Inter','Helvetica Neue',Arial,sans-serif;
  font-size:11pt;
  line-height:1.5;
  box-sizing:border-box;
">
  ${renderResumeHeader(personalInfo)}
  <main style="margin-top:18px;">
    ${styleResumeBody(bodyHtml)}
  </main>
</div>
`;
}

/**
 * Render a cover letter as a plain business letter — minimal styling, just the
 * sender's name + contact in a small block at top-right, the date, and the
 * letter body. Intentionally less designed than the resume.
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

  const senderLines = [
    personalInfo.fullName,
    personalInfo.email,
    personalInfo.phone,
  ]
    .filter(Boolean)
    .map(escapeHtml);

  return `
<div class="kresume-doc" style="
  ${widthStyle}
  margin:0 auto;
  padding:${padding};
  background:#ffffff;
  color:#0f172a;
  font-family:'Inter','Helvetica Neue',Arial,sans-serif;
  font-size:11pt;
  line-height:1.65;
  box-sizing:border-box;
">
  ${
    senderLines.length
      ? `<div style="text-align:right;color:#475569;font-size:10pt;line-height:1.4;">
          ${senderLines.map((l) => `<div>${l}</div>`).join('')}
        </div>`
      : ''
  }
  <p style="margin:24px 0 24px;color:#475569;font-size:10.5pt;">${escapeHtml(today)}</p>
  <main>${styleCoverBody(bodyHtml)}</main>
</div>
`;
}

function renderResumeHeader(p: PersonalInfo): string {
  const name = (p.fullName || 'Your Name').trim();
  const contactBits = [p.email, p.phone, p.location].filter(Boolean).map(escapeHtml);
  const links = Object.entries(p.socialLinks || {})
    .filter(([, v]) => Boolean(v))
    .map(([k, v]) => {
      const label = SOCIAL_LABELS[k] || k;
      return `<a href="${escapeAttr(v as string)}" style="color:#4f46e5;text-decoration:none;">${escapeHtml(label)}</a>`;
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
      ? `<div style="margin-top:4px;font-size:10pt;">${links.join('  ·  ')}</div>`
      : ''
  }
</header>`;
}

const SOCIAL_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn',
  github: 'GitHub',
  portfolio: 'Portfolio',
  twitter: 'Twitter',
  other: 'Website',
};

function styleResumeBody(html: string): string {
  return html
    .replace(
      /<h2(\b[^>]*)>/g,
      `<h2$1 style="margin:18px 0 6px;font-size:12.5pt;font-weight:700;color:#4f46e5;text-transform:uppercase;letter-spacing:0.08em;border-bottom:1px solid #e2e8f0;padding-bottom:4px;">`
    )
    .replace(
      /<h3(\b[^>]*)>/g,
      `<h3$1 style="margin:10px 0 2px;font-size:11.5pt;font-weight:600;color:#0f172a;">`
    )
    .replace(
      /<p(\b[^>]*)>/g,
      `<p$1 style="margin:0 0 8px;color:#1e293b;line-height:1.55;">`
    )
    .replace(
      /<ul(\b[^>]*)>/g,
      `<ul$1 style="margin:4px 0 10px;padding-left:18px;">`
    )
    .replace(
      /<li(\b[^>]*)>/g,
      `<li$1 style="margin:0 0 4px;color:#1e293b;line-height:1.5;">`
    )
    .replace(
      /<strong(\b[^>]*)>/g,
      `<strong$1 style="color:#0f172a;font-weight:600;">`
    );
}

function styleCoverBody(html: string): string {
  // Cover letter uses minimal styling — just consistent paragraph spacing.
  return html
    .replace(
      /<p(\b[^>]*)>/g,
      `<p$1 style="margin:0 0 14px;color:#1e293b;line-height:1.7;">`
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
