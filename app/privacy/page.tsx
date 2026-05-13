export const metadata = { title: 'Privacy Policy — kairesume' };

export default function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-14 sm:py-20 text-white/80">
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">Privacy Policy</h1>
      <p className="mt-2 text-sm text-white/50">Last updated: {new Date().toLocaleDateString()}</p>

      <article className="mt-10 space-y-8 leading-relaxed text-sm">
        <Section title="1. What we collect">
          <p>
            <strong className="text-white">Account data:</strong> when you sign up we store your email and an
            authentication identifier via Supabase.
          </p>
          <p>
            <strong className="text-white">Usage data:</strong> we keep an aggregate count of generations on your
            profile.
          </p>
          <p>
            <strong className="text-white">Resume content:</strong> uploaded resumes and pasted job descriptions are
            processed in-memory by our AI provider (Groq) and discarded after the response is returned. We do not
            retain the original files.
          </p>
        </Section>

        <Section title="2. What we don't collect">
          <p>
            We do not sell or rent your data. We do not run analytics scripts that fingerprint you. We do not store
            your payment credentials — crypto payments go directly to our wallet on Binance Smart Chain (BEP-20).
          </p>
        </Section>

        <Section title="3. Cookies">
          <p>
            We use a single signed HTTP-only cookie to track free-tier generation counts for anonymous users, plus
            standard authentication cookies issued by Supabase.
          </p>
        </Section>

        <Section title="4. Third parties">
          <p>
            We use Groq (LLM provider) to generate content, Supabase to host the database and authentication, and
            BscScan to verify cryptocurrency transactions on Binance Smart Chain. These providers have their own privacy policies.
          </p>
        </Section>

        <Section title="5. Data deletion">
          <p>
            You can delete your account and associated profile data at any time by contacting us. Anonymous
            generation counts are automatically discarded when the cookie expires.
          </p>
        </Section>

        <Section title="6. Contact">
          <p>For privacy questions, contact us via the email address listed on our website.</p>
        </Section>
      </article>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-white mb-2">{title}</h2>
      <div className="text-white/70 space-y-2">{children}</div>
    </section>
  );
}
