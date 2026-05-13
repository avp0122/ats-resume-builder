/**
 * ATS Resume & Cover Letter Generator - Utility Functions
 * 
 * Helper functions for JSON sanitization, HTML validation, hashing, and file processing.
 */

import { createHash as createCryptoHash } from 'crypto';
import mammoth from 'mammoth';
import { PdfReader } from 'pdfreader';

/**
 * Create a SHA-256 hash of input string for caching
 */
export function createHash(input: string): string {
  return createCryptoHash('sha256').update(input).digest('hex');
}

/**
 * Sanitize JSON response from LLM
 * Removes any extra whitespace and ensures valid JSON structure
 */
export function sanitizeJSON(jsonString: string): string {
  return jsonString
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Validate HTML string (basic check)
 * Ensures HTML has proper opening/closing tags for key elements
 */
export function validateHTML(html: string): boolean {
  if (!html || typeof html !== 'string') {
    return false;
  }

  // Check for basic HTML structure
  const hasContent = html.length > 0;
  const hasValidTags = !html.includes('<>') && !html.includes('</>');
  
  // Check for unescaped quotes that might break JSON
  const quoteCount = (html.match(/"/g) || []).length;
  const escapedQuoteCount = (html.match(/\\"/g) || []).length;
  
  return hasContent && hasValidTags;
}

/**
 * Escape HTML special characters for safe rendering
 */
export function escapeHTML(str: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  
  return str.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Unescape HTML special characters
 */
export function unescapeHTML(str: string): string {
  const map: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#039;': "'",
  };
  
  return str.replace(/&(amp|lt|gt|quot|#039);/g, (match) => map[match]);
}

/**
 * Calculate combined hash for JD + resume pair
 */
export function createContentHash(jd: string, resume: string): string {
  const combined = `${jd}:::${resume}`;
  return createHash(combined);
}

/**
 * Format error message for user display
 */
export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message;

    // Pre-flight: input too large to fit the free-tier rate limit. The
    // upstream message already includes a per-input token breakdown.
    if (/too large for the free-tier rate limit/i.test(msg)) {
      return msg; // already user-friendly
    }
    // Truncated response from the LLM — actionable, distinct from rate limits.
    if (/exceeded the maximum length|cut off before completing|max_tokens/i.test(msg)) {
      return 'The AI response was too long. Try a shorter resume or job description and retry.';
    }
    // Surface rate-limit / payload-size errors clearly — these are actionable.
    if (msg.includes('413') || /payload too large/i.test(msg) || /tokens per minute|TPM/i.test(msg)) {
      return "Your request exceeded the AI provider's rate limit. Try a shorter resume or job description, or wait a minute and retry.";
    }
    if (msg.includes('429') || /rate limit/i.test(msg)) {
      return 'Too many requests right now. Please wait a moment and try again.';
    }
    if (/GROQ_API_KEY|api key/i.test(msg)) {
      return 'AI provider is not configured. Add GROQ_API_KEY to your .env.local and restart the dev server.';
    }
    if (/ENOTFOUND|ECONNREFUSED|fetch failed|network/i.test(msg)) {
      return 'Failed to reach the AI service. Check your internet connection and try again.';
    }
    if (msg.includes('parse') || msg.includes('JSON')) {
      return 'Received invalid response from AI service. Please try again.';
    }
    return msg;
  }

  return 'An unexpected error occurred. Please try again.';
}

/**
 * Compress resume/JD text extracted from a document so we send fewer tokens
 * to the LLM without losing information.
 *
 * PDF-derived text is usually noisy: extra whitespace between every word,
 * scattered page numbers, repeated headers/footers, single-character bullet
 * artifacts. This routine cleans those up.
 */
export function compressText(text: string): string {
  if (!text) return '';
  const lines = text.split(/\r?\n/);
  const cleaned: string[] = [];
  let lastLine = '';

  for (let raw of lines) {
    // Normalize internal whitespace.
    let line = raw.replace(/\s+/g, ' ').trim();
    if (!line) continue;

    // Drop standalone page numbers ("3", "Page 3 of 12", "3/12").
    if (
      /^(page\s*)?\d{1,3}(\s*(of|\/)\s*\d{1,3})?$/i.test(line) ||
      /^- \d+ -$/.test(line)
    ) {
      continue;
    }

    // Drop very short artifact lines (single chars / bullets-only).
    if (line.length <= 1) continue;

    // Skip exact duplicate of previous line (repeated PDF headers/footers).
    if (line === lastLine) continue;

    cleaned.push(line);
    lastLine = line;
  }

  // Join with single newlines, collapse 3+ blank lines that may have been
  // implicit, and trim.
  return cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Rough token estimate (chars/4) — close enough for budgeting against the
 * Groq free-tier TPM cap. We don't pull tiktoken just for this.
 */
export function estimateTokens(text: string): number {
  return Math.ceil((text || '').length / 4);
}

/**
 * Validate minimum input requirements
 */
export function validateInputs(jd: string, resume: string): { valid: boolean; error?: string } {
  if (!jd || jd.trim().length === 0) {
    return { valid: false, error: 'Job description cannot be empty' };
  }
  
  if (!resume || resume.trim().length === 0) {
    return { valid: false, error: 'Resume cannot be empty' };
  }
  
  if (jd.trim().length < 50) {
    return { valid: false, error: 'Job description is too short. Please provide more details.' };
  }
  
  if (resume.trim().length < 50) {
    return { valid: false, error: 'Resume is too short. Please provide more details.' };
  }
  
  return { valid: true };
}

/**
 * Extract text from PDF file buffer.
 *
 * Primary: pdfjs-dist (Mozilla's renderer). Robust across multi-column
 * layouts and the export quirks of resume builders like Cake Resume,
 * Canva, Novoresume — pdfreader silently returns empty text for several
 * of those.
 *
 * Fallback: pdfreader, retained for the small set of PDFs where pdfjs
 * stumbles (rare custom CMap encodings).
 */
export async function extractTextFromPDF(buffer: ArrayBuffer): Promise<string> {
  let primary = '';
  try {
    primary = await extractTextWithPdfJs(buffer);
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('pdfjs-dist extraction failed, falling back to pdfreader:', err);
    }
  }
  if (primary && primary.trim().length >= 20) return primary.trim();

  try {
    const fallback = await extractTextWithPdfReader(buffer);
    if (fallback && fallback.trim().length >= 20) return fallback.trim();
    // Return whichever has more content if both are short.
    return (primary.length >= fallback.length ? primary : fallback).trim();
  } catch (err) {
    if (primary) return primary.trim();
    throw err;
  }
}

async function extractTextWithPdfJs(buffer: ArrayBuffer): Promise<string> {
  // The legacy build is the supported entry point for Node — the default
  // ESM build assumes a browser worker that we don't have here.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // Disable the worker so pdfjs runs in-process. The worker entry path
  // varies between Next dev/build and would otherwise need bundling.
  const loadingTask = (pdfjs as any).getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = (content.items as Array<any>)
      .map((it) => (typeof it?.str === 'string' ? it.str : ''))
      .filter((s) => s.length > 0)
      .join(' ');
    pages.push(pageText);
  }
  return pages.join('\n');
}

function extractTextWithPdfReader(buffer: ArrayBuffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const pdfReader = new PdfReader();
    let text = '';

    pdfReader.parseBuffer(Buffer.from(buffer), (err, item) => {
      if (err) {
        reject(new Error(`Failed to extract text from PDF: ${err}`));
        return;
      }

      if (!item) {
        // End of file
        resolve(text.trim());
        return;
      }

      if (item.text) {
        text += item.text + ' ';
      }
    });
  });
}

/**
 * Extract text from DOCX file buffer
 */
export async function extractTextFromDOCX(buffer: ArrayBuffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return result.value.trim();
  } catch (error) {
    throw new Error(`Failed to extract text from DOCX: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extract text from uploaded file
 */
export async function extractTextFromFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  
  if (file.type === 'application/pdf') {
    return extractTextFromPDF(buffer);
  } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return extractTextFromDOCX(buffer);
  } else {
    throw new Error('Unsupported file type. Please upload a PDF or DOCX file.');
  }
}
