'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';

/**
 * Server Action: force-refresh the /jobs page's underlying API caches.
 *
 * Staff-only — every other user gets a no-op (returning `{ ok: false }` and
 * the cached page stays put). The staff check happens here, not in the
 * client, because the client could be tampered with. Burning the daily
 * Remote OK / Remotive quota is the actual concern.
 *
 * Flow:
 *   1. revalidateTag('jobs')     — invalidates the cached fetch() responses
 *      from RemoteOK + Remotive. The tags are set in lib/jobs.ts.
 *   2. revalidatePath('/jobs')   — invalidates the rendered page so the next
 *      request rebuilds it with fresh API data.
 *
 * The client then `router.refresh()`'s to pull the rebuilt HTML.
 */
export async function refreshJobs(): Promise<{ ok: boolean; reason?: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: 'auth-not-configured' };
  }
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, reason: 'not-signed-in' };

    const { data: profile } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .maybeSingle();

    if (profile?.plan !== 'staff') {
      return { ok: false, reason: 'not-staff' };
    }

    revalidateTag('jobs');
    revalidatePath('/jobs');
    return { ok: true };
  } catch (e) {
    console.error('refreshJobs failed:', e);
    return { ok: false, reason: 'server-error' };
  }
}
