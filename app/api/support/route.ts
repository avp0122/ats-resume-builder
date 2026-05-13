import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

// Minimal in-process rate limit so a single visitor can't fire 500
// support tickets in a tight loop. Keyed by IP — fine for our scale,
// would need Redis in a multi-region deploy.
const RATE_BUCKET = new Map<string, number[]>();
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_MAX = 5; // 5 tickets per IP per hour

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const list = (RATE_BUCKET.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (list.length >= RATE_MAX) {
    RATE_BUCKET.set(ip, list);
    return true;
  }
  list.push(now);
  RATE_BUCKET.set(ip, list);
  return false;
}

function clientIp(request: NextRequest): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Support is not available right now.' },
      { status: 503 }
    );
  }

  let body: { subject?: string; message?: string; email?: string; phone?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const subject = (body.subject || '').trim();
  const message = (body.message || '').trim();
  const providedEmail = (body.email || '').trim();
  const providedPhone = (body.phone || '').trim();

  if (subject.length < 3 || subject.length > 200) {
    return NextResponse.json(
      { error: 'Subject must be 3–200 characters.' },
      { status: 400 }
    );
  }
  if (message.length < 10 || message.length > 5000) {
    return NextResponse.json(
      { error: 'Message must be 10–5000 characters.' },
      { status: 400 }
    );
  }
  if (providedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(providedEmail)) {
    return NextResponse.json({ error: 'Email looks invalid.' }, { status: 400 });
  }
  // Phone is optional; if given, accept anything 7–25 chars of digits,
  // spaces, dashes, parens, and a single optional leading +. Keep this
  // forgiving — international formats vary wildly and a strict regex just
  // annoys legitimate users.
  if (providedPhone && !/^\+?[\d\s().-]{7,25}$/.test(providedPhone)) {
    return NextResponse.json({ error: 'Phone number looks invalid.' }, { status: 400 });
  }

  const ip = clientIp(request);
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many support requests from this network. Try again later.' },
      { status: 429 }
    );
  }

  // If the user is signed in, link the ticket to their account and trust
  // their auth email over whatever is in the form.
  let userId: string | null = null;
  let userEmail: string | null = null;
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      userId = user.id;
      userEmail = user.email ?? null;
    }
  } catch {
    // Continue as anonymous.
  }

  // Email is required for anonymous senders — without one we have no way
  // to reply. Signed-in users supply theirs implicitly via auth so the
  // form doesn't even render the field for them.
  const resolvedEmail = userEmail || providedEmail || null;
  if (!resolvedEmail) {
    return NextResponse.json(
      { error: 'Email is required so we can reply.' },
      { status: 400 }
    );
  }

  // Insert via the admin client so we don't need a permissive RLS policy
  // that would let anyone INSERT with an arbitrary user_id.
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('support_tickets')
    .insert({
      user_id: userId,
      email: resolvedEmail,
      phone: providedPhone || null,
      subject,
      message,
      client_ip: ip,
      client_ua: request.headers.get('user-agent') || null,
    })
    .select('id, created_at')
    .single();

  if (error) {
    console.error('support insert failed:', error);
    return NextResponse.json(
      { error: 'Could not save your message. Please try again.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, ticketId: data.id, createdAt: data.created_at });
}
