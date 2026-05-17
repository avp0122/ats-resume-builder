import { NextRequest, NextResponse } from 'next/server';
import { generateATSContent } from '@/lib/llm';
import {
  validateInputs,
  createContentHash,
  formatErrorMessage,
  extractTextFromFile,
  compressText,
  estimateTokens,
  truncateToTokenBudget,
} from '@/lib/utils';
import { bumpAnonCount, readAnonCount, FREE_LIMIT } from '@/lib/usage';
import { ensureAnonId } from '@/lib/anonId';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { effectivePlan, signedInFreeDownloadAllowed } from '@/lib/plan';
import { SIGNED_IN_FREE_GENERATIONS } from '@/lib/pricing';

// Local helper. We can't import from lib/usage without dragging in cookies().
function clampFreeCount(plan: 'free' | 'pro', count: number): number {
  if (plan === 'free') return Math.min(count, SIGNED_IN_FREE_GENERATIONS);
  return count;
}

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
    if (!resumeText || resumeText.trim().length < 20) {
      // PDF parsed but no meaningful text came out — usually means the PDF
      // is image-only (scanned), uses an unusual font encoding, or was
      // exported with text rendered as paths. We want a specific message
      // instead of the generic "Resume cannot be empty" validation error.
      return NextResponse.json(
        {
          error:
            'We could not extract text from your resume. The file may be image-only, scanned, or use a non-standard font encoding. Try re-exporting as a text-based PDF (e.g. "Save as PDF" from Word/Google Docs) or upload a DOCX.',
        },
        { status: 400 }
      );
    }

    // Strip noisy whitespace, page numbers, repeated headers/footers,
    // EEO/boilerplate, and long URL paths. Then hard-cap each input at
    // a per-text budget so the COMBINED request can never exceed
    // Groq's free-tier 8K TPM ceiling — pre-cap users were getting
    // "Requested 8315, Limit 8000" errors because our token estimate
    // ran ~10% below reality. estimateTokens is now chars/3.5 (more
    // pessimistic) and we still truncate as a belt + suspenders.
    //
    // Per-input caps (tightened after a real-world "Requested 8524,
    // Limit 8000" breach with the previous 1800/2500 caps):
    //   - JD: 1500 tokens — JDs are mostly keyword bait + boilerplate
    //     past the requirements list. Truncating fluff is low-cost.
    //   - Resume: 2000 tokens — the candidate's actual content;
    //     trimmed second (and harder) only when needed.
    //
    // Together that's max 3500 input + ~400 prompt scaffold +
    // 2500 output reservation + 1200 safety = ~7600 worst-case
    // estimated. If Groq's real tokenizer still disagrees, lib/llm.ts
    // catches the 413 and auto-shrinks once.
    const MAX_JD_TOKENS = 1500;
    const MAX_RESUME_TOKENS = 2000;
    const compressedResumeRaw = compressText(resumeText);
    const compressedJdRaw = compressText(jd);
    const compressedJd = truncateToTokenBudget(compressedJdRaw, MAX_JD_TOKENS);
    const compressedResume = truncateToTokenBudget(
      compressedResumeRaw,
      MAX_RESUME_TOKENS
    );
    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `Compression: resume ${resumeText.length} → ${compressedResumeRaw.length} → ${compressedResume.length} chars (~${estimateTokens(resumeText)} → ${estimateTokens(compressedResume)} tokens), jd ${jd.length} → ${compressedJdRaw.length} → ${compressedJd.length} chars (~${estimateTokens(jd)} → ${estimateTokens(compressedJd)} tokens)`
      );
    }

    const validation = validateInputs(compressedJd, compressedResume);
    if (!validation.valid) return NextResponse.json({ error: validation.error }, { status: 400 });

    // Identify user (signed in or anonymous).
    let userId: string | null = null;
    let plan: 'free' | 'pro' = 'free';
    let proUntil: string | null = null;
    let preGenCount = 0; // generations_count as of *before* this request
    if (isSupabaseConfigured()) {
      try {
        const supabase = createSupabaseServerClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          userId = user.id;
          const { data: profile } = await supabase
            .from('profiles')
            .select('plan, pro_until, generations_count')
            .eq('id', user.id)
            .maybeSingle();
          plan = effectivePlan(profile);
          proUntil = profile?.pro_until ?? null;
          preGenCount = profile?.generations_count ?? 0;
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

    // Early gate for signed-in FREE users: enforce the hard cap *before* we
    // call the LLM. Without this, the count keeps growing past the limit
    // because the original code only decided downloadAllowed=false at the
    // end — the LLM had already run and the counter had already been
    // incremented. That's the root cause of the 6–7 stored generations
    // bug.
    if (userId && plan === 'free' && preGenCount >= SIGNED_IN_FREE_GENERATIONS) {
      // While we're here, opportunistically clamp any over-count that
      // accumulated before this fix shipped, so the user's profile reads
      // back the expected "3/3" instead of "6/3".
      if (preGenCount > SIGNED_IN_FREE_GENERATIONS) {
        try {
          const admin = createSupabaseAdminClient();
          await admin
            .from('profiles')
            .update({ generations_count: SIGNED_IN_FREE_GENERATIONS })
            .eq('id', userId);
        } catch (e) {
          console.error('Free-plan count clamp failed (non-fatal):', e);
        }
      }
      return NextResponse.json(
        {
          error: `You've used all ${SIGNED_IN_FREE_GENERATIONS} free generations. Upgrade to Pro for unlimited.`,
          usage: {
            count: SIGNED_IN_FREE_GENERATIONS,
            freeLimit: SIGNED_IN_FREE_GENERATIONS,
            downloadAllowed: false,
            needsSignin: false,
            signedIn: true,
            plan: 'free' as const,
            proUntil,
            upgradeRequired: true,
          },
        },
        { status: 402 }
      );
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
      // Bump the generations_count on the profile (via the user's session
      // client so this works WITHOUT a service-role key — RLS lets a user
      // update their own profile). Then write a row into resume_uploads
      // with the resume-derived contact info, target role/company, OS
      // info, and the scores. Each uploaded resume gets its own row;
      // profiles holds only USER state (plan + counter).
      try {
        const supabase = createSupabaseServerClient();
        const pi = result.personalInfo;

        // Profile holds USER state only (plan + generations counter). The
        // resume-derived contact block (name/phone/location/links) goes
        // into resume_uploads below — see migration 008.
        const { data: profile } = await supabase
          .from('profiles')
          .select('generations_count')
          .eq('id', userId)
          .maybeSingle();
        const rawNext = (profile?.generations_count ?? 0) + 1;
        // For free users we MUST clamp at the limit. Otherwise the counter
        // keeps growing past 3 even though we deny downloads — that's
        // what produced the "6/3" rows in the DB.
        usageCount = clampFreeCount(plan, rawNext);
        if (plan === 'free') {
          downloadAllowed = signedInFreeDownloadAllowed(usageCount);
          needsSignin = false; // already signed in
        }

        const profilePatch: Record<string, unknown> = {
          id: userId,
          generations_count: usageCount,
        };

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
      // Anonymous flow: bump the usage cookie + write a resume_uploads
      // row keyed by a stable per-visitor anon_id. When the visitor
      // later signs up, /api/auth/signup claims these rows by setting
      // user_id and clearing anon_id (atomic UPDATE).
      //
      // The preview is still blurred + download is still gated until
      // the visitor signs up — storage is a *parallel* concern, not a
      // grant of access.
      usageCount = bumpAnonCount();
      downloadAllowed = false;
      needsSignin = true;

      try {
        const anonId = ensureAnonId();
        const pi = result.personalInfo;
        const admin = createSupabaseAdminClient();
        const { error: anonUploadErr } = await admin.from('resume_uploads').insert({
          user_id: null,
          anon_id: anonId,
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
        if (anonUploadErr) {
          // Non-fatal — anon row capture is analytics, not the user-
          // facing response. Most likely cause is SUPABASE_SECRET_KEY
          // being unset in dev; the admin client throws on construct
          // in that case and we're caught by the outer try.
          console.error('Anonymous resume_uploads insert failed:', anonUploadErr);
        }
      } catch (e) {
        console.error('Anonymous resume_uploads write threw (non-fatal):', e);
      }
    }

    // Word + token counts for the UI. These are computed from the
    // compressed (post-cleanup) inputs that the LLM actually saw — that's
    // the number that matters for the budget the user is being shown.
    const countWords = (s: string) =>
      s.trim() ? s.trim().split(/\s+/).length : 0;
    const inputStats = {
      jdWords: countWords(compressedJd),
      jdTokens: estimateTokens(compressedJd),
      resumeWords: countWords(compressedResume),
      resumeTokens: estimateTokens(compressedResume),
    };

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
      inputStats,
      usage: {
        count: usageCount,
        freeLimit: userId ? SIGNED_IN_FREE_GENERATIONS : FREE_LIMIT,
        remaining:
          plan === 'pro'
            ? null
            : userId
            ? Math.max(0, SIGNED_IN_FREE_GENERATIONS - usageCount)
            : Math.max(0, FREE_LIMIT - usageCount),
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
