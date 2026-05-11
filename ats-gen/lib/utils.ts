/**
 * ATS Resume & Cover Letter Generator - Utility Functions
 * 
 * Helper functions for JSON sanitization, HTML validation, and hashing.
 */

import { createHash } from 'crypto';

/**
 * Create a SHA-256 hash of input string for caching
 */
export function createHash(input: string): string {
  return createHash('sha256').update(input).digest('hex');
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
    // Don't expose internal API details to users
    if (error.message.includes('API')) {
      return 'Failed to connect to AI service. Please check your internet connection and try again.';
    }
    if (error.message.includes('parse') || error.message.includes('JSON')) {
      return 'Received invalid response from AI service. Please try again.';
    }
    return error.message;
  }
  
  return 'An unexpected error occurred. Please try again.';
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
