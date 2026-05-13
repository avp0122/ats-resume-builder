import type { Metadata } from 'next';
import SupportForm from '@/components/SupportForm';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Support',
  description:
    'Free support for kairesume. Send us a note — bug reports, billing questions, feature requests. We read every message.',
};

export default async function SupportPage() {
  let signedInEmail: string | null = null;
  if (isSupabaseConfigured()) {
    try {
      const supabase = createSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      signedInEmail = user?.email ?? null;
    } catch {
      // Auth optional.
    }
  }

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
      <header className="mb-10 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight bg-gradient-to-r from-white via-fuchsia-200 to-sky-200 bg-clip-text text-transparent">
          Support
        </h1>
        <p className="mt-3 text-white/60 max-w-xl mx-auto">
          Free for everyone — paid plan or not. Tell us what&apos;s wrong, what&apos;s
          missing, or what you&apos;d love to see. We read every message.
        </p>
      </header>

      <SupportForm signedInEmail={signedInEmail} />
    </main>
  );
}
