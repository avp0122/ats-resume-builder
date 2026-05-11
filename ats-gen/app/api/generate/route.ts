import { NextRequest, NextResponse } from 'next/server';
import { generateATSContent } from '@/lib/llm';
import { validateInputs, createContentHash, formatErrorMessage } from '@/lib/utils';

// In-memory cache for 5 minutes
const cache = new Map<string, {
  result: { resume: string; coverLetter: string };
  timestamp: number;
}>();

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Clean expired cache entries
 */
function cleanCache() {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_TTL_MS) {
      cache.delete(key);
    }
  }
}

/**
 * POST /api/generate
 * 
 * Accepts job description and resume, returns ATS-optimized resume and cover letter
 */
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    let body: { jd?: string; resume?: string };
    
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    const { jd, resume } = body;

    // Validate inputs
    const validation = validateInputs(jd || '', resume || '');
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    // Check cache
    cleanCache();
    const cacheKey = createContentHash(jd!, resume!);
    const cachedResult = cache.get(cacheKey);
    
    if (cachedResult) {
      console.log('Returning cached result');
      return NextResponse.json({
        resume: cachedResult.result.resume,
        coverLetter: cachedResult.result.coverLetter,
      });
    }

    // Generate ATS content
    console.log('Generating ATS content...');
    const result = await generateATSContent(jd!, resume!);

    // Cache the result
    cache.set(cacheKey, {
      result,
      timestamp: Date.now(),
    });

    console.log('Successfully generated ATS content');

    return NextResponse.json({
      resume: result.resume,
      coverLetter: result.coverLetter,
    });

  } catch (error) {
    console.error('API error:', error);
    
    const errorMessage = formatErrorMessage(error);
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
