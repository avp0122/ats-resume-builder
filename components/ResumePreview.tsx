'use client';

import { useState } from 'react';

type CopyMode = 'none' | 'html' | 'text';

interface ResumePreviewProps {
  /** Styled HTML rendered inside the preview pane (with contact header). */
  previewHtml: string;
  /** Fully styled HTML used for the PDF download (typically PDF-sized). */
  downloadHtml: string;
  title: string;
  filename: string;
  downloadAllowed: boolean;
  /** Which copy button to show (if any). */
  copyMode?: CopyMode;
  onDownload: (html: string, filename: string) => void;
  onLockedAction?: () => void;
}

export default function ResumePreview({
  previewHtml,
  downloadHtml,
  title,
  filename,
  downloadAllowed,
  copyMode = 'none',
  onDownload,
  onLockedAction,
}: ResumePreviewProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (copyMode === 'none') return;
    if (!downloadAllowed) {
      onLockedAction?.();
      return;
    }
    const value = copyMode === 'text' ? htmlToPlainText(downloadHtml) : downloadHtml;
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  };

  const handleDownload = () => {
    if (!downloadAllowed) {
      onLockedAction?.();
      return;
    }
    onDownload(downloadHtml, filename);
  };

  const copyLabel = copyMode === 'text' ? 'Copy text' : 'Copy HTML';

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/60 backdrop-blur-xl overflow-hidden shadow-2xl">
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 bg-white/5">
        <h3 className="text-sm font-semibold text-white tracking-tight">{title}</h3>
        <div className="flex gap-2">
          {copyMode !== 'none' && (
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white/80 bg-white/5 border border-white/10 rounded-md hover:bg-white/10 transition"
            >
              {copied ? '✓ Copied' : copyLabel}
            </button>
          )}
          <button
            onClick={handleDownload}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition shadow ${
              downloadAllowed
                ? 'bg-gradient-to-r from-fuchsia-500 to-indigo-500 text-white hover:opacity-90'
                : 'bg-white/10 text-white/70 hover:bg-white/15'
            }`}
          >
            {downloadAllowed ? (
              <>
                <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M10 3v10m0 0l-3.5-3.5M10 13l3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Download PDF
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M10 1a4 4 0 00-4 4v3H5a2 2 0 00-2 2v7a2 2 0 002 2h10a2 2 0 002-2v-7a2 2 0 00-2-2h-1V5a4 4 0 00-4-4zm2 7V5a2 2 0 10-4 0v3h4z"
                    clipRule="evenodd"
                  />
                </svg>
                Sign in to download
              </>
            )}
          </button>
        </div>
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
  // innerText respects line breaks introduced by block elements.
  const text = (div as HTMLElement).innerText || div.textContent || '';
  return text.replace(/\n{3,}/g, '\n\n').trim();
}
