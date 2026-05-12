import type { PersonalInfo } from './llm';

/**
 * Render a polished, ATS-friendly resume document (single column, no graphics).
 *
 * The HTML returned here is consumed by html2pdf in the browser. Inline styles
 * are used because html2canvas (under the hood) snapshots computed styles.
 *
 * Design goals:
 *   - Single column, text-extractable layout (ATS-safe)
 *   - Clean typographic hierarchy with a subtle accent color
 *   - Contact header at the top so the candidate's identity is unmistakable
 */
export function renderResumeDocument(
  personalInfo: PersonalInfo,
  bodyHtml: string,
  variant: 'preview' | 'pdf' = 'pdf'
): string {
  const isPdf = variant === 'pdf';
  const wrapperWidth = isPdf ? 'max-width:8.5in;' : 'max-width:760px;';
  const padding = isPdf ? 'padding:0.5in 0.6in;' : 'padding:32px 36px;';

  return `
<div class="kresume-doc" style="
  ${wrapperWidth}
  margin:0 auto;
  ${padding}
  background:#ffffff;
  color:#0f172a;
  font-family:'Inter','Helvetica Neue',Arial,sans-serif;
  font-size:11pt;
  line-height:1.5;
">
  ${renderHeader(personalInfo)}
  <main style="margin-top:18px;">
    ${styleBody(bodyHtml)}
  </main>
</div>
`;
}

/**
 * Render a cover letter document with the same header style, suitable for PDF.
 */
export function renderCoverLetterDocument(
  personalInfo: PersonalInfo,
  bodyHtml: string,
  variant: 'preview' | 'pdf' = 'pdf'
): string {
  const isPdf = variant === 'pdf';
  const wrapperWidth = isPdf ? 'max-width:8.5in;' : 'max-width:760px;';
  const padding = isPdf ? 'padding:0.5in 0.6in;' : 'padding:32px 36px;';
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `
<div class="kresume-doc" style="
  ${wrapperWidth}
  margin:0 auto;
  ${padding}
  background:#ffffff;
  color:#0f172a;
  font-family:'Inter','Helvetica Neue',Arial,sans-serif;
  font-size:11pt;
  line-height:1.6;
">
  ${renderHeader(personalInfo)}
  <p style="margin:18px 0 12px;color:#475569;font-size:10.5pt;">${escapeHtml(today)}</p>
  <main>
    ${styleBody(bodyHtml)}
  </main>
</div>
`;
}

function renderHeader(p: PersonalInfo): string {
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

/**
 * Re-style the LLM-generated body HTML with inline section styling.
 * The LLM emits <h2>/<h3>/<p>/<ul>/<li>/<strong>; we wrap them with
 * inline styles so html2canvas captures them in the PDF snapshot.
 */
function styleBody(html: string): string {
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
