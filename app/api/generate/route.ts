import { NextRequest, NextResponse } from 'next/server';
import { generateATSContent } from '@/lib/llm';
import {
  validateInputs,
  createContentHash,
  formatErrorMessage,
  extractTextFromFile,
} from '@/lib/utils';
import { bumpAnonCount, anonDownloadAllowed, FREE_LIMIT } from '@/lib/usage';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const cache = new Map<string, { result: any; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function cleanCache() {
  const now = Date.now();
  cache.forEach((value, key) => {
    if (now - value.timestamp > CACHE_TTL_MS) cache.delete(key);
  });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const jd = formData.get('jd') as string;
    const resumeFile = formData.get('resume') as File;

    if (!jd || !resumeFile) {
      return NextResponse.json(
        { error: 'Both job description and resume file are required' },
        { status: 400 }
      );
    }
    if (resumeFile.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Resume file too large. Max 10MB.' }, { status: 400 });
    }

    let resumeText: string;
    try {
      resumeText = await extractTextFromFile(resumeFile);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Failed to process resume file' },
        { status: 400 }
      );
    }

    const validation = validateInputs(jd, resumeText);
    if (!validation.valid) return NextResponse.json({ error: validation.error }, { status: 400 });

    // Identify user (signed in or anonymous).
    let userId: string | null = null;
    let plan: 'free' | 'pro' = 'free';
    if (isSupabaseConfigured()) {
      try {
        const supabase = createSupabaseServerClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          userId = user.id;
          const { data: profile } = await supabase
            .from('profiles')
            .select('plan')
            .eq('id', user.id)
            .single();
          plan = (profile?.plan as 'free' | 'pro') || 'free';
        }
      } catch {
        // Auth optional; continue as anon.
      }
    }

    cleanCache();
    const cacheKey = createContentHash(jd, resumeText) + ':' + (userId || 'anon');
    const cached = cache.get(cacheKey);

    let result;
    if (cached) {
      result = cached.result;
    } else {
      result = await generateATSContent(jd, resumeText);
      cache.set(cacheKey, { result, timestamp: Date.now() });
    }

    // Track usage + decide download gating.
    let downloadAllowed = true;
    let usageCount = 0;
    let needsSignin = false;

    if (userId) {
      // Signed in — unlimited for now. Increment counter + opportunistically
      // backfill personal info on the profile (only fields that are still empty).
      try {
        const admin = createSupabaseAdminClient();
        const { data: profile } = await admin
          .from('profiles')
          .select('generations_count, full_name, contact_email, phone, location, date_of_birth, social_links')
          .eq('id', userId)
          .single();
        usageCount = (profile?.generations_count ?? 0) + 1;

        const update: Record<string, unknown> = { generations_count: usageCount };
        const pi = result.personalInfo;
        if (pi.fullName && !profile?.full_name) update.full_name = pi.fullName;
        if (pi.email && !profile?.contact_email) update.contact_email = pi.email;
        if (pi.phone && !profile?.phone) update.phone = pi.phone;
        if (pi.location && !profile?.location) update.location = pi.location;
        if (pi.dateOfBirth && !profile?.date_of_birth) update.date_of_birth = pi.dateOfBirth;
        const existingLinks =
          profile?.social_links && typeof profile.social_links === 'object'
            ? (profile.social_links as Record<string, string>)
            : {};
        const mergedLinks: Record<string, string> = { ...existingLinks };
        for (const [k, v] of Object.entries(pi.socialLinks) as Array<[string, string | undefined]>) {
          if (v && !mergedLinks[k]) mergedLinks[k] = v;
        }
        if (JSON.stringify(mergedLinks) !== JSON.stringify(existingLinks)) {
          update.social_links = mergedLinks;
        }

        await admin.from('profiles').update(update).eq('id', userId);
      } catch {
        // non-fatal
      }
    } else {
      usageCount = bumpAnonCount();
      downloadAllowed = anonDownloadAllowed(usageCount);
      needsSignin = !downloadAllowed;
    }

    return NextResponse.json({
      personalInfo: result.personalInfo,
      resume: result.resume,
      coverLetter: result.coverLetter,
      score: result.score,
      matchedKeywords: result.matchedKeywords,
      missingKeywords: result.missingKeywords,
      usage: {
        count: usageCount,
        freeLimit: FREE_LIMIT,
        downloadAllowed,
        needsSignin,
        plan,
      },
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: formatErrorMessage(error) }, { status: 500 });
  }
}
