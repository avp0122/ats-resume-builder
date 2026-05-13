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
            authentication identifier via Supabase, plus your operating system, browser type and version, and
            approximate geographic location (country and city, looked up from your IP). These help us with support
            and abuse-prevention.
          </p>
          <p>
            <strong className="text-white">Usage data:</strong> we keep an aggregate count of generations on your
            profile and a per-generation record (target role, target company, ATS score, and the contact details
            extracted from the resume — name, email, phone, location, links). Anonymous generations are stored
            against a random identifier in a signed HTTP-only cookie until you sign up, at which point they are
            attached to your account.
          </p>
          <p>
            <strong className="text-white">Resume content:</strong> the resume file and job description text are
            processed in-memory by our AI provider (Groq) and discarded after the response is returned — we do not
            retain the raw files. Only the structured fields above are persisted.
          </p>
        </Section>

        <Section title="2. What we don't collect">
          <p>
            We do not sell or rent your data. We do not run analytics scripts that fingerprint you. We do not store
            your payment credentials — crypto payments go directly to our wallet on Tron (TRC-20) or Ethereum (ERC-20).
          </p>
        </Section>

        <Section title="3. Cookies">
          <p>
            We use two signed HTTP-only cookies for anonymous visitors: one tracks free-tier generation counts,
            the other carries a random identifier so the resumes you generate before signing up can be attached to
            your account when you sign up. Both expire after one year. Signed-in users additionally receive
            standard authentication cookies issued by Supabase.
          </p>
        </Section>

        <Section title="4. Third parties">
          <p>
            We use Groq (LLM provider) to generate content, Supabase to host the database and authentication, ipapi.co
            for approximate geo-IP lookup at signup, and TronGrid (Tron) plus Etherscan V2 (Ethereum) to verify
            USDT transactions on TRC-20 and ERC-20. These providers have their own privacy policies.
          </p>
        </Section>

        <Section title="5. Data deletion">
          <p>
            You can delete your account and all associated profile and generation records at any time by contacting
            us. Anonymous generation records are attached to your account when you sign up; otherwise they remain
            tied to the random cookie identifier and are discarded along with the cookie when it expires (one year)
            or when you clear your browser data.
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
