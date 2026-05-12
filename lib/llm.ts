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
 * Extract JSON from text that might contain extra content
 */
function extractJSON(text: string): string {
  const cleaned = stripMarkdownFences(text);
  
  // Try to find JSON object boundaries
  const startBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  
  if (startBrace === -1 || lastBrace === -1 || lastBrace < startBrace) {
    throw new Error('No valid JSON object found in response');
  }
  
  // Extract the JSON substring
  const jsonCandidate = cleaned.substring(startBrace, lastBrace + 1);
  
  // Try to fix common JSON issues
  let fixedJson = jsonCandidate
    .replace(/,\s*}/g, '}') // Remove trailing commas
    .replace(/,\s*]/g, ']') // Remove trailing commas in arrays
    .replace(/\n/g, '\\n') // Escape newlines in strings
    .replace(/\r/g, '\\r') // Escape carriage returns
    .replace(/\t/g, '\\t'); // Escape tabs
  
  // Try to fix unterminated strings by finding and closing them
  const stringMatches = fixedJson.match(/("(?:[^"\\]|\\.)*")/g) || [];
  let lastStringEnd = 0;
  
  for (const match of stringMatches) {
    lastStringEnd = fixedJson.indexOf(match, lastStringEnd) + match.length;
  }
  
  // If there's unterminated string content after the last complete string
  if (lastStringEnd < fixedJson.length) {
    const remaining = fixedJson.substring(lastStringEnd);
    if (remaining.includes('"') === false) {
      // Close the unterminated string
      fixedJson = fixedJson.substring(0, lastStringEnd) + '"' + remaining;
    }
  }
  
  return fixedJson;
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
    // If JSON parsing fails, try to extract content manually
    console.error('JSON parsing failed:', error);
    console.error('Raw response:', text.substring(0, 500) + '...');
    
    // Fallback: try to extract resume and cover letter manually
    const resumeMatch = text.match(/"resume"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/s);
    const coverLetterMatch = text.match(/"coverLetter"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/s);
    
    if (resumeMatch && coverLetterMatch) {
      return {
        personalInfo: { ...EMPTY_PERSONAL_INFO },
        resume: resumeMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'),
        coverLetter: coverLetterMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'),
        originalScore: 0,
        score: 0,
        matchedKeywords: [],
        missingKeywords: [],
      };
    }
    
    throw new Error(`Failed to parse LLM response: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Call Groq API with llama3-70b-8192 model
 */
async function callGroq(prompt: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  
  if (!apiKey) {
    throw new Error('GROQ_API_KEY not configured');
  }

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      messages: [
        {
          role: 'system',
          content:
            'You are an ATS optimization assistant. You MUST respond with a single valid JSON object containing exactly two string keys: "resume" and "coverLetter". No prose, no markdown fences — JSON only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 4000,
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
  return data.choices?.[0]?.message?.content || '';
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
  const prompt = getATSPrompt(jd, resume);

  const maxRetries = 2;
  let lastError: Error | null = null;

  // Try Groq first (primary provider)
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempting Groq API call (attempt ${attempt + 1})`);
      const response = await callGroq(prompt);
      
      if (!response) {
        throw new Error('Empty response from Groq API');
      }
      
      return parseJSONResponse(response);
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
