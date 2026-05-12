import { NextResponse } from 'next/server';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';

export async function POST() {
  if (!isSupabaseConfigured()) return NextResponse.json({ ok: true });
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
