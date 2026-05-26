import Link from 'next/link';

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-20 border-t border-white/10 bg-slate-950/40 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <div className="grid sm:grid-cols-3 gap-8">
          <div>
            <Link href="/" className="inline-flex items-center gap-2">
              <span className="h-7 w-7 rounded-md bg-gradient-to-br from-fuchsia-500 via-indigo-500 to-sky-400 grid place-items-center font-bold text-white text-sm shadow-lg shadow-fuchsia-500/30">
                K
              </span>
              <span className="text-white font-semibold tracking-tight">kairesume</span>
            </Link>
            <p className="mt-3 text-xs text-white/50 leading-relaxed">
              ATS-friendly resumes & cover letters generated with AI. Free to try, pay once for unlimited use.
            </p>
          </div>

          <div>
            <h4 className="text-xs font-semibold tracking-widest text-white/40 uppercase">Product</h4>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link href="/" className="text-white/70 hover:text-white transition">
                  Generate
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="text-white/70 hover:text-white transition">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="/jobs" className="text-white/70 hover:text-white transition">
                  Jobs
                </Link>
              </li>
              <li>
                <Link href="/blog" className="text-white/70 hover:text-white transition">
                  Blog
                </Link>
              </li>
              <li>
                <Link href="/account" className="text-white/70 hover:text-white transition">
                  Account
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold tracking-widest text-white/40 uppercase">Legal</h4>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link href="/terms" className="text-white/70 hover:text-white transition">
                  Terms & Conditions
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-white/70 hover:text-white transition">
                  Privacy Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/40">
          <div>© {year} kairesume. All rights reserved.</div>
          <div>Inputs processed in-memory and discarded after generation.</div>
        </div>
      </div>
    </footer>
  );
}
