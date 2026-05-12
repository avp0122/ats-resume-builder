import { createClient, SupabaseClient } from '@supabase/supabase-js';

function getSecretKey(): string | undefined {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
}

/**
 * Admin/secret client — bypasses RLS. Use ONLY in server routes for
 * privileged writes (e.g., recording verified payments, bumping plan).
 */
export function createSupabaseAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = getSecretKey();
  if (!url || !key) {
    throw new Error(
      'Supabase admin client is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY).'
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
