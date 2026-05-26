'use client';

import { useState } from 'react';

interface ResumePreviewProps {
  /** Styled HTML rendered inside the preview pane (with contact header). */
  previewHtml: string;
  title: string;
  /**
   * If provided, a "Copy text" button is shown that copies the plaintext
   * version of this HTML (typically the cover letter, for pasting into an
   * email body). PDF download lives at the page level now — one button for
   * resume + cover letter together.
   */
  copyText?: string;
}

export default function ResumePreview({ previewHtml, title, copyText }: ResumePreviewProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!copyText) return;
    navigator.clipboard
      .writeText(htmlToPlainText(copyText))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/60 backdrop-blur-xl overflow-hidden shadow-2xl">
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 bg-white/5">
        <h3 className="text-sm font-semibold text-white tracking-tight">{title}</h3>
        {copyText && (
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white/80 bg-white/5 border border-white/10 rounded-md hover:bg-white/10 transition"
          >
            {copied ? '✓ Copied' : 'Copy text'}
          </button>
        )}
      </div>

      <div
        className="preview-scroll p-6 overflow-auto bg-slate-100"
        style={{ maxHeight: '720px' }}
      >
        <div
          className="shadow-lg rounded-md"
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      </div>
    </div>
  );
}

/**
 * Convert document HTML to plain text suitable for clipboard / pasting into
 * an email.
 *
 * `innerText` on a *detached* div is unreliable across browsers — Safari in
 * particular returns the textContent equivalent (no block-level newlines),
 * which is how the cover letter ended up as one run-on line when pasted.
 * So we pre-process the HTML to inject explicit newlines at block
 * boundaries BEFORE letting the browser flatten it, instead of relying on
 * any browser's interpretation of CSS layout for whitespace.
 */
function htmlToPlainText(html: string): string {
  // 1. Insert explicit paragraph breaks at block-level boundaries. Order
  //    matters: replace closing+opening pairs first so we don't double-
  //    insert when both run.
  const withBreaks = html
    .replace(/<\/p\s*>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<\/li\s*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/(h[1-6]|ul|ol|div|section|article|header|footer|main)\s*>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n');

  // 2. Strip remaining tags and decode entities via the browser.
  const div = document.createElement('div');
  div.innerHTML = withBreaks;
  const text = (div as HTMLElement).textContent || '';

  // 3. Tidy up: trim whitespace per line, collapse blank-line runs to one
  //    blank line, drop leading/trailing blank lines.
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
