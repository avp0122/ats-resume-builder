/**
 * ATS Resume & Cover Letter Generator - LLM Client
 * 
 * Provides Groq API integration with retry logic and exponential backoff.
 */

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

export interface PersonalInfo {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  dateOfBirth: string; // ISO date or ""
  socialLinks: {
    linkedin?: string;
    github?: string;
    portfolio?: string;
    twitter?: string;
    other?: string;
  };
}

export interface ATSGenerationResult {
  personalInfo: PersonalInfo;
  resume: string;
  coverLetter: string;
  originalScore: number;
  score: number;
  matchedKeywords: string[];
  missingKeywords: string[];
}

export const EMPTY_PERSONAL_INFO: PersonalInfo = {
  fullName: '',
  email: '',
  phone: '',
  location: '',
  dateOfBirth: '',
  socialLinks: {},
};

function normalizePersonalInfo(raw: unknown): PersonalInfo {
  const info = (raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const linksRaw = (info.socialLinks && typeof info.socialLinks === 'object'
    ? (info.socialLinks as Record<string, unknown>)
    : {}) as Record<string, unknown>;
  const link = (k: string) => {
    const v = str(linksRaw[k]);
    return v && /^https?:\/\//i.test(v) ? v : '';
  };
  const socialLinks: PersonalInfo['socialLinks'] = {};
  for (const k of ['linkedin', 'github', 'portfolio', 'twitter', 'other'] as const) {
    const v = link(k);
    if (v) socialLinks[k] = v;
  }
  // Validate dateOfBirth as ISO yyyy-mm-dd
  const dob = str(info.dateOfBirth);
  const dobOk = /^\d{4}-\d{2}-\d{2}$/.test(dob);
  return {
    fullName: str(info.fullName),
    email: str(info.email),
    phone: str(info.phone),
    location: str(info.location),
    dateOfBirth: dobOk ? dob : '',
    socialLinks,
  };
}

interface LLMError extends Error {
  statusCode?: number;
  truncated?: boolean;
}

/**
 * Sleep utility for exponential backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Strip markdown code fences from LLM response
 */
function stripMarkdownFences(text: string): string {
  return text
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')
    .trim();
}

/**
 * Extract JSON from text that might contain extra content.
 *
 * IMPORTANT: a previous version of this helper used "first { ... last }"
 * to slice out a substring. That silently masked truncated responses by
 * trimming a broken tail down to the largest valid prefix, which then
 * parsed as a JSON object missing the truncated keys. We now refuse to
 * accept text that doesn't end with a closing brace, so callers see a
 * clear "truncated" error instead of a confusing "missing field" error.
 */
function extractJSON(text: string): string {
  const cleaned = stripMarkdownFences(text);
  const startBrace = cleaned.indexOf('{');
  if (startBrace === -1) {
    throw new Error('No valid JSON object found in response');
  }
  const trimmed = cleaned.slice(startBrace).trimEnd();
  if (!trimmed.endsWith('}')) {
    const err: LLMError = new Error(
      'Response ended mid-stream (no closing brace). Likely max_tokens was reached.'
    );
    err.truncated = true;
    throw err;
  }
  return trimmed
    .replace(/,\s*}/g, '}')
    .replace(/,\s*]/g, ']');
}

/**
 * Safely parse JSON from LLM response
 */
function parseJSONResponse(text: string): ATSGenerationResult {
  try {
    let parsed: {
      resume?: unknown;
      coverLetter?: unknown;
      score?: unknown;
      originalScore?: unknown;
      matchedKeywords?: unknown;
      missingKeywords?: unknown;
      personalInfo?: unknown;
    };
    try {
      parsed = JSON.parse(text);
    } catch {
      const jsonString = extractJSON(text);
      parsed = JSON.parse(jsonString);
    }

    // Tolerance: some model outputs nest the top-level keys (resume,
    // coverLetter, scores, keywords) INSIDE personalInfo. JSON is still
    // valid, but our structure check would otherwise fail. Detect that and
    // hoist the misplaced fields back to the top level before validating.
    const pi = parsed.personalInfo as Record<string, unknown> | undefined;
    if (!parsed.resume && pi && typeof pi.resume === 'string') {
      parsed.resume = pi.resume;
      parsed.coverLetter = (parsed.coverLetter ?? pi.coverLetter) as unknown;
      parsed.originalScore = (parsed.originalScore ?? pi.originalScore) as unknown;
      parsed.score = (parsed.score ?? pi.score) as unknown;
      parsed.matchedKeywords = (parsed.matchedKeywords ?? pi.matchedKeywords) as unknown;
      parsed.missingKeywords = (parsed.missingKeywords ?? pi.missingKeywords) as unknown;
      delete pi.resume;
      delete pi.coverLetter;
      delete pi.originalScore;
      delete pi.score;
      delete pi.matchedKeywords;
      delete pi.missingKeywords;
    }

    if (!parsed.resume || !parsed.coverLetter) {
      throw new Error('Invalid response structure: missing resume or coverLetter');
    }

    const clampScore = (v: unknown) =>
      Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
    const score = clampScore(parsed.score);
    const originalScore = clampScore(parsed.originalScore);
    const toStringArray = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 20) : [];

    return {
      personalInfo: normalizePersonalInfo(parsed.personalInfo),
      resume: String(parsed.resume),
      coverLetter: String(parsed.coverLetter),
      originalScore,
      score,
      matchedKeywords: toStringArray(parsed.matchedKeywords),
      missingKeywords: toStringArray(parsed.missingKeywords),
    };
  } catch (error) {
    console.error('JSON parsing failed:', error);
    console.error('Raw response (first 800 chars):', text.substring(0, 800));
    console.error('Raw response (last 200 chars):', text.slice(-200));

    // If the upstream (extractJSON) tagged this as truncated, propagate that.
    if (error instanceof Error && (error as LLMError).truncated) {
      throw error;
    }
    // Heuristic: response that doesn't end with `}` was almost certainly cut.
    if (!text.trim().endsWith('}')) {
      const err: LLMError = new Error(
        'The AI response was cut off before completing. Try a shorter resume or job description.'
      );
      err.truncated = true;
      throw err;
    }

    throw new Error(
      `Failed to parse LLM response: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

interface GroqCallResult {
  content: string;
  finishReason: string;
}

/**
 * Call Groq with the ATS prompt. Returns content + finish_reason so callers
 * can distinguish "model decided to stop" from "max_tokens limit hit".
 */
async function callGroq(prompt: string, maxTokens: number): Promise<GroqCallResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not configured');

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      messages: [
        {
          role: 'system',
          content:
            'You are an ATS optimization assistant. Respond with a single valid JSON object matching the schema in the user prompt. JSON only — no prose, no markdown fences.',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.3,
      top_p: 1,
      stream: false,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const error: LLMError = new Error(
      `Groq API error: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`
    );
    error.statusCode = response.status;
    throw error;
  }

  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content || '',
    finishReason: data.choices?.[0]?.finish_reason || 'stop',
  };
}

/**
 * Generate ATS content with retry logic
 * 
 * @param jd - Job description text
 * @param resume - Original resume text
 * @returns Promise resolving to ATS-optimized resume and cover letter
 */
export async function generateATSContent(
  jd: string,
  resume: string
): Promise<ATSGenerationResult> {
  // Import prompt function dynamically to avoid circular dependencies
  const { getATSPrompt } = await import('./prompts');
  const { estimateTokens } = await import('./utils');
  const prompt = getATSPrompt(jd, resume);

  // Fit within the Groq free-tier 8000 TPM ceiling: input + max_tokens <= 8000.
  // Reserve a safety margin so we don't trip the rate limiter on rounding.
  const TPM_BUDGET = 8000;
  const SAFETY_MARGIN = 300;
  const MIN_OUTPUT = 2500; // Below this we cannot reliably fit a resume + cover letter.
  const MAX_OUTPUT = 5500; // Headroom we believe is enough for full output.
  const inputTokens = estimateTokens(prompt);
  const maxTokens = Math.max(
    MIN_OUTPUT,
    Math.min(MAX_OUTPUT, TPM_BUDGET - SAFETY_MARGIN - inputTokens)
  );
  if (TPM_BUDGET - SAFETY_MARGIN - inputTokens < MIN_OUTPUT) {
    throw new Error(
      `Resume + job description are too large for the free-tier rate limit (estimated ${inputTokens} input tokens; max ~${TPM_BUDGET - SAFETY_MARGIN - MIN_OUTPUT} allowed). Trim the resume or job description and try again.`
    );
  }
  console.log(
    `Token budget: input≈${inputTokens}, max_tokens=${maxTokens}, total≈${inputTokens + maxTokens} (cap ${TPM_BUDGET})`
  );

  const maxRetries = 2;
  let lastError: Error | null = null;

  // Try Groq first (primary provider)
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempting Groq API call (attempt ${attempt + 1})`);
      const { content, finishReason } = await callGroq(prompt, maxTokens);

      if (!content) {
        throw new Error('Empty response from Groq API');
      }

      // Detect server-side truncation explicitly so we surface a clear error
      // instead of falling into "missing field" parsing failures.
      if (finishReason === 'length') {
        const err: LLMError = new Error(
          'The AI response exceeded the maximum length. Try a shorter resume or job description.'
        );
        err.truncated = true;
        throw err;
      }

      return parseJSONResponse(content);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      
      // Check if we should retry (429 rate limit or 5xx server errors)
      const llmError = error as LLMError;
      const isRetryable = 
        llmError.statusCode === 429 || 
        (llmError.statusCode && llmError.statusCode >= 500);
      
      if (!isRetryable || attempt >= maxRetries) {
        break;
      }
      
      // Exponential backoff: 1s, 2s, 4s...
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`Retrying in ${delay}ms due to: ${lastError.message}`);
      await sleep(delay);
    }
  }

  // All attempts failed
  throw new Error(
    `Groq generation failed after retries. Last error: ${lastError?.message || 'Unknown error'}`
  );
}
