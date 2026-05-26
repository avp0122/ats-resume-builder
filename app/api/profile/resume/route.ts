import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromFile } from '@/lib/utils';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/profile/resume
 *   multipart/form-data with field `resume`: PDF or DOCX, ≤ 10MB.
 *   Extracts text and writes:
 *     profiles.resume_text         ← extracted plain text
 *     profiles.resume_filename     ← original filename (display-only)
 *     profiles.resume_uploaded_at  ← now()
 *   Original file is discarded after extraction.
 *
 * DELETE /api/profile/resume
 *   Clears all three resume_* columns. Used when the user wants to
 *   remove their stored resume.
 *
 * Auth required for both. We use the user's session client (RLS lets a
 * user upsert their own profile row); on RLS-related failure we fall
 * back to the admin client, mirroring the pattern in /api/generate.
 */

const MAX_BYTES = 10 * 1024 * 1024;

function unauthorized() {
  return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
}

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Auth is not configured on this deploy.' }, { status: 503 });
  }
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form submission.' }, { status: 400 });
  }

  const file = formData.get('resume') as File | null;
  if (!file || typeof file === 'string' || !file.name) {
    return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'Resume file is too large. Max 10MB.' },
      { status: 413 }
    );
  }
  const lowerName = file.name.toLowerCase();
  const looksLikeResume =
    lowerName.endsWith('.pdf') ||
    lowerName.endsWith('.docx') ||
    file.type === 'application/pdf' ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (!looksLikeResume) {
    return NextResponse.json(
      { error: 'Resume must be a PDF or DOCX file.' },
      { status: 400 }
    );
  }

  let resumeText: string;
  try {
    resumeText = await extractTextFromFile(file);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to process resume file.' },
      { status: 400 }
    );
  }
  if (!resumeText || resumeText.trim().length < 20) {
    return NextResponse.json(
      {
        error:
          'We could not extract text from your resume. The file may be image-only, scanned, or use a non-standard font encoding. Try re-exporting as a text-based PDF or upload a DOCX.',
      },
      { status: 400 }
    );
  }

  const patch = {
    id: user.id,
    resume_text: resumeText,
    resume_filename: file.name,
    resume_uploaded_at: new Date().toISOString(),
  };

  const { error: upsertErr } = await supabase
    .from('profiles')
    .upsert(patch, { onConflict: 'id' });

  if (upsertErr) {
    // Same fallback pattern as /api/generate — if the user's session
    // upsert hits an RLS edge case we admin-write the change.
    console.error('Profile resume upsert via session failed, trying admin:', upsertErr);
    try {
      const admin = createSupabaseAdminClient();
      const { error: adminErr } = await admin
        .from('profiles')
        .upsert(patch, { onConflict: 'id' });
      if (adminErr) {
        return NextResponse.json(
          { error: 'Could not save resume — please try again.' },
          { status: 500 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: 'Could not save resume — please try again.' },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    ok: true,
    filename: file.name,
    uploaded_at: patch.resume_uploaded_at,
    chars: resumeText.length,
  });
}

export async function DELETE() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Auth is not configured on this deploy.' }, { status: 503 });
  }
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const patch = {
    id: user.id,
    resume_text: null,
    resume_filename: null,
    resume_uploaded_at: null,
  };

  const { error } = await supabase.from('profiles').upsert(patch, { onConflict: 'id' });
  if (error) {
    console.error('Profile resume DELETE via session failed, trying admin:', error);
    try {
      const admin = createSupabaseAdminClient();
      const { error: adminErr } = await admin
        .from('profiles')
        .upsert(patch, { onConflict: 'id' });
      if (adminErr) {
        return NextResponse.json(
          { error: 'Could not remove resume — please try again.' },
          { status: 500 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: 'Could not remove resume — please try again.' },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true });
}
