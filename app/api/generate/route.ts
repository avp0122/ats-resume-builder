import { NextRequest, NextResponse } from 'next/server';
import { generateATSContent } from '@/lib/llm';
import {
  validateInputs,
  createContentHash,
  formatErrorMessage,
  extractTextFromFile,
  compressText,
  estimateTokens,
} from '@/lib/utils';
import { bumpAnonCount, readAnonCount, FREE_LIMIT } from '@/lib/usage';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { effectivePlan, signedInFreeDownloadAllowed } from '@/lib/plan';
import { SIGNED_IN_FREE_GENERATIONS } from '@/lib/pricing';

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
    const clientOs = (formData.get('client_os') as string | null) || null;
    const clientVersion = (formData.get('client_version') as string | null) || null;

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

    // Strip noisy whitespace, page numbers, repeated headers/footers from the
    // PDF/DOCX extraction. Keeps token count low so we fit Groq's free-tier
    // 8K TPM budget. Same for the JD field.
    const compressedResume = compressText(resumeText);
    const compressedJd = compressText(jd);
    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `Compression: resume ${resumeText.length} → ${compressedResume.length} chars (~${estimateTokens(resumeText)} → ${estimateTokens(compressedResume)} tokens), jd ${jd.length} → ${compressedJd.length} chars`
      );
    }

    const validation = validateInputs(compressedJd, compressedResume);
    if (!validation.valid) return NextResponse.json({ error: validation.error }, { status: 400 });

    // Identify user (signed in or anonymous).
    let userId: string | null = null;
    let userEmail: string | null = null;
    let plan: 'free' | 'pro' = 'free';
    let proUntil: string | null = null;
    if (isSupabaseConfigured()) {
      try {
        const supabase = createSupabaseServerClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          userId = user.id;
          userEmail = user.email ?? null;
          const { data: profile } = await supabase
            .from('profiles')
            .select('plan, pro_until')
            .eq('id', user.id)
            .maybeSingle();
          plan = effectivePlan(profile);
          proUntil = profile?.pro_until ?? null;
        }
      } catch {
        // Auth optional; continue as anon.
      }
    }

    // Early gate for anonymous users: hard cap on generations *before* we
    // pay for the LLM call. After this they have to sign up.
    if (!userId) {
      const currentAnonCount = readAnonCount();
      if (currentAnonCount >= FREE_LIMIT) {
        return NextResponse.json(
          {
            error:
              'Free anonymous generation limit reached. Sign up free to get 3 generations per month.',
          },
          { status: 403 }
        );
      }
    }

    cleanCache();
    const cacheKey =
      createContentHash(compressedJd, compressedResume) + ':' + (userId || 'anon');
    const cached = cache.get(cacheKey);

    let result;
    if (cached) {
      result = cached.result;
    } else {
      result = await generateATSContent(compressedJd, compressedResume);
      cache.set(cacheKey, { result, timestamp: Date.now() });
    }

    // Track usage + decide download gating.
    let downloadAllowed = true;
    let usageCount = 0;
    let needsSignin = false;

    if (userId) {
      // Signed in — Pro is unlimited; free is gated at SIGNED_IN_FREE_GENERATIONS.
      // Bump the profile counter via the user's session client so this
      // works WITHOUT requiring SUPABASE_SECRET_KEY (RLS lets a user
      // update their own profile). Then write the per-upload row into
      // resume_uploads with the freshly-extracted contact info + OS so
      // we keep history of every distinct resume the user uploads.
      try {
        const supabase = createSupabaseServerClient();
        const pi = result.personalInfo;

        // Profile counter + one-time backfill of contact fields when empty.
        const { data: profile } = await supabase
          .from('profiles')
          .select('generations_count, full_name, contact_email, phone, location, date_of_birth, social_links')
          .eq('id', userId)
          .maybeSingle();
        usageCount = (profile?.generations_count ?? 0) + 1;
        if (plan === 'free') {
          downloadAllowed = signedInFreeDownloadAllowed(usageCount);
          needsSignin = false; // already signed in
        }

        const profilePatch: Record<string, unknown> = {
          id: userId,
          generations_count: usageCount,
        };
        if (pi.fullName && !profile?.full_name) profilePatch.full_name = pi.fullName;
        if (pi.email && !profile?.contact_email) profilePatch.contact_email = pi.email;
        if (!profile?.contact_email && userEmail && !profilePatch.contact_email) {
          profilePatch.contact_email = userEmail;
        }
        if (pi.phone && !profile?.phone) profilePatch.phone = pi.phone;
        if (pi.location && !profile?.location) profilePatch.location = pi.location;
        if (pi.dateOfBirth && !profile?.date_of_birth) profilePatch.date_of_birth = pi.dateOfBirth;
        const existingLinks =
          profile?.social_links && typeof profile.social_links === 'object'
            ? (profile.social_links as Record<string, string>)
            : {};
        const mergedLinks: Record<string, string> = { ...existingLinks };
        for (const [k, v] of Object.entries(pi.socialLinks) as Array<[string, string | undefined]>) {
          if (v && !mergedLinks[k]) mergedLinks[k] = v;
        }
        if (JSON.stringify(mergedLinks) !== JSON.stringify(existingLinks)) {
          profilePatch.social_links = mergedLinks;
        }

        const { error: profileErr } = await supabase
          .from('profiles')
          .upsert(profilePatch, { onConflict: 'id' });
        if (profileErr) {
          // Last-resort fallback: try the admin client. Useful if RLS
          // hasn't been migrated yet (e.g. before migration 004).
          console.error('Profile upsert via session failed, trying admin:', profileErr);
          try {
            const admin = createSupabaseAdminClient();
            await admin.from('profiles').upsert(profilePatch, { onConflict: 'id' });
          } catch (e2) {
            console.error('Admin fallback also failed:', e2);
          }
        }

        // Per-upload row — captures the contact info from THIS resume,
        // independent of whatever's on the profile. One user can upload
        // several resumes with different details.
        const { error: uploadErr } = await supabase.from('resume_uploads').insert({
          user_id: userId,
          full_name: pi.fullName || null,
          contact_email: pi.email || null,
          phone: pi.phone || null,
          location: pi.location || null,
          date_of_birth: pi.dateOfBirth || null,
          social_links: pi.socialLinks || {},
          target_role: result.jobRole || null,
          target_company: result.jobCompany || null,
          client_os: clientOs,
          client_version: clientVersion,
          original_score: result.originalScore,
          score: result.score,
        });
        if (uploadErr) {
          console.error('resume_uploads insert failed (non-fatal):', uploadErr);
        }
      } catch (e) {
        console.error('Signed-in profile/upload write failed (non-fatal):', e);
      }
    } else {
      // Anonymous flow: we let the user generate (within ANON_FREE_LIMIT)
      // and see the ATS scores + matched/missing keywords, but the actual
      // optimized resume + cover letter are paywalled. They have to sign
      // up to unlock preview / copy / download.
      usageCount = bumpAnonCount();
      downloadAllowed = false;
      needsSignin = true;
    }

    return NextResponse.json({
      personalInfo: result.personalInfo,
      jobRole: result.jobRole,
      jobCompany: result.jobCompany,
      resume: result.resume,
      coverLetter: result.coverLetter,
      originalScore: result.originalScore,
      score: result.score,
      matchedKeywords: result.matchedKeywords,
      missingKeywords: result.missingKeywords,
      usage: {
        count: usageCount,
        freeLimit: userId ? SIGNED_IN_FREE_GENERATIONS : FREE_LIMIT,
        downloadAllowed,
        needsSignin,
        signedIn: !!userId,
        plan,
        proUntil,
      },
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: formatErrorMessage(error) }, { status: 500 });
  }
}
