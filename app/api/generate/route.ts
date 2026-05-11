import { NextRequest, NextResponse } from 'next/server';
import { generateATSContent } from '@/lib/llm';
import { validateInputs, createContentHash, formatErrorMessage, extractTextFromFile } from '@/lib/utils';

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
  cache.forEach((value, key) => {
    if (now - value.timestamp > CACHE_TTL_MS) {
      cache.delete(key);
    }
  });
}

/**
 * POST /api/generate
 * 
 * Accepts job description and resume file, returns ATS-optimized resume and cover letter
 */
export async function POST(request: NextRequest) {
  try {
    // Parse multipart form data
    const formData = await request.formData();
    const jd = formData.get('jd') as string;
    const resumeFile = formData.get('resume') as File;

    if (!jd || !resumeFile) {
      return NextResponse.json(
        { error: 'Both job description and resume file are required' },
        { status: 400 }
      );
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (resumeFile.size > maxSize) {
      return NextResponse.json(
        { error: 'Resume file is too large. Maximum size is 10MB.' },
        { status: 400 }
      );
    }

    // Extract text from resume file
    let resumeText: string;
    try {
      resumeText = await extractTextFromFile(resumeFile);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to process resume file' },
        { status: 400 }
      );
    }

    // Validate inputs
    const validation = validateInputs(jd, resumeText);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    // Check cache
    cleanCache();
    const cacheKey = createContentHash(jd, resumeText);
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
    const result = await generateATSContent(jd, resumeText);

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
