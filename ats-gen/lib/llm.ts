/**
 * ATS Resume & Cover Letter Generator - LLM Client
 * 
 * Provides unified interface for Groq (primary) and Google Gemini (fallback)
 * with retry logic and exponential backoff.
 */

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

export interface ATSGenerationResult {
  resume: string;
  coverLetter: string;
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
 * Safely parse JSON from LLM response
 */
function parseJSONResponse(text: string): ATSGenerationResult {
  const cleaned = stripMarkdownFences(text);
  
  try {
    const parsed = JSON.parse(cleaned);
    
    if (!parsed.resume || !parsed.coverLetter) {
      throw new Error('Invalid response structure: missing resume or coverLetter');
    }
    
    return {
      resume: String(parsed.resume),
      coverLetter: String(parsed.coverLetter),
    };
  } catch (error) {
    throw new Error(`Failed to parse LLM response as JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      model: 'llama3-70b-8192',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 2500,
      temperature: 0.3,
      top_p: 1,
      stream: false,
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
 * Call Google Gemini API (fallback)
 */
async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: 2500,
        temperature: 0.3,
        topP: 1,
      },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const error: LLMError = new Error(
      `Gemini API error: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`
    );
    error.statusCode = response.status;
    throw error;
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/**
 * Generate ATS content with retry logic and fallback
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

  // Fallback to Gemini if Groq fails completely
  console.log('Groq failed, attempting fallback to Gemini...');
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempting Gemini API call (attempt ${attempt + 1})`);
      const response = await callGemini(prompt);
      
      if (!response) {
        throw new Error('Empty response from Gemini API');
      }
      
      return parseJSONResponse(response);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      
      const llmError = error as LLMError;
      const isRetryable = 
        llmError.statusCode === 429 || 
        (llmError.statusCode && llmError.statusCode >= 500);
      
      if (!isRetryable || attempt >= maxRetries) {
        break;
      }
      
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`Retrying in ${delay}ms due to: ${lastError.message}`);
      await sleep(delay);
    }
  }

  // All attempts failed
  throw new Error(
    `All LLM providers failed. Last error: ${lastError?.message || 'Unknown error'}`
  );
}
