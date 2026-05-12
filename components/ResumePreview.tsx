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
 * an email. Uses the browser's text rendering so <p>, <br>, <li> become
 * proper newlines.
 */
function htmlToPlainText(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  const text = (div as HTMLElement).innerText || div.textContent || '';
  return text.replace(/\n{3,}/g, '\n\n').trim();
}
