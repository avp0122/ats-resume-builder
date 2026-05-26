# Architecture

> Last reviewed: 2026-05-26. Keep this file in sync as the system changes — most ground truths live here, not in scattered comments.

## Overview

**kairesume** is a free AI-powered ATS (Applicant Tracking System) resume builder. The user pastes a job description, uploads a resume (PDF or DOCX), and receives:

- A rewritten ATS-friendly resume optimised for the JD's keywords.
- A tailored 3–4 paragraph cover letter.
- An ATS match score (0–100) plus matched + missing keyword lists.
- A ZIP containing the resume + cover letter as both **PDF** and **DOCX**.

Anonymous visitors get one free generation with a blurred preview (must sign up to unlock the download). Signed-in free accounts get 10 generations per month. Pro is unlimited at $4.99/mo, $11.98/3mo (-20%), or $41.92/yr (-30%), paid in USDT on Tron (TRC-20) or Ethereum (ERC-20).

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 14.2.5 (App Router) | File-convention routing, server components by default, easy Vercel deploy |
| Language | TypeScript | Type safety across server + client + Supabase rows |
| Styling | Tailwind CSS | No design-system bloat, fast iteration |
| Auth + DB | Supabase (Postgres + Auth) | Free tier covers all current needs, RLS handles per-user data |
| LLM | Groq · `llama-3.3-70b-versatile` | 12K TPM free tier, fast inference, reliable JSON mode |
| PDF extract (server) | `pdf-parse` (pdfjs-dist 1.10 internally) | Worker-free, serverless-safe — `pdfjs-dist` 4.x worker bug forced this |
| PDF render (client) | `html2pdf.js` | Snapshot HTML → PDF entirely in-browser, no server cost |
| DOCX render (client) | `@turbodocx/html-to-docx` | Browser-safe, produces real OOXML, no server cost |
| Crypto verify | Etherscan V2 unified API (chainid 1 + 56) + TronGrid | One key covers all EVM chains; TronGrid is required for TRC-20 (non-EVM) |
| Hosting | Vercel | Auto deploys, serverless functions, edge cache |
| CDN / DNS | Cloudflare (proxied) | Free tier protection; injects `Content-Signal` header on robots.txt — see [Important constraints](#important-constraints) |
| Analytics | `@vercel/analytics` + `@vercel/speed-insights` | First-party, no third-party trackers |

## Folder structure

```
.
├── app/                          # Next.js 14 App Router
│   ├── api/
│   │   ├── auth/{signup,signin,signout}/route.ts
│   │   ├── checkout/{crypto,verify}/route.ts
│   │   ├── generate/route.ts     # main LLM pipeline
│   │   ├── support/route.ts
│   │   └── usage/route.ts        # quota lookup (drives the home page banner)
│   ├── account/                  # signed-in dashboard
│   ├── checkout/                 # crypto payment page
│   ├── pricing/                  # plans
│   ├── privacy/  terms/          # legal
│   ├── signin/   signup/         # auth
│   ├── layout.tsx                # root layout + ALL metadata + JSON-LD
│   ├── page.tsx                  # home (upload + generate + preview + download)
│   ├── robots.ts                 # /robots.txt (Next file convention)
│   ├── sitemap.ts                # /sitemap.xml
│   └── llms.txt/route.ts         # /llms.txt for AI answer engines
│
├── components/                   # client-side React components
│   ├── ATSScore.tsx              # score card + keyword chips
│   ├── AuthForm.tsx
│   ├── Navbar.tsx  Footer.tsx
│   ├── PricingCard.tsx           # multi-tier picker
│   ├── ResumePreview.tsx         # blurred-when-anonymous preview
│   ├── SupportWidget.tsx         # floating bottom-right popup
│   └── RouteProgress.tsx         # animated top progress bar
│
├── lib/                          # framework-agnostic logic
│   ├── llm.ts                    # Groq call + token budgeting + 413 auto-retry
│   ├── prompts.ts                # the ATS prompt template
│   ├── utils.ts                  # PDF extract, text compression, token estimate, truncation
│   ├── resumeTemplate.ts         # HTML renderer for resume + cover letter
│   ├── pricing.ts                # PLANS, PRO_TIERS, Chain, all quota constants
│   ├── crypto.ts                 # TRC-20 + ERC-20 transaction verifier
│   ├── geoip.ts                  # best-effort signup geolocation
│   ├── userAgent.ts              # tiny UA parser
│   ├── usage.ts  anonId.ts       # signed HTTP-only cookies (counter + anon id)
│   ├── plan.ts                   # effectivePlan() + download-allowed logic
│   ├── nav.ts                    # programmatic route-progress trigger
│   └── supabase/{client,server,admin}.ts
│
├── supabase/
│   ├── schema.sql                # canonical schema (fresh installs)
│   └── migrations/00N_*.sql      # ordered, idempotent migrations
│
├── docs/                         # ← you're here
│   ├── ARCHITECTURE.md
│   ├── DECISIONS.md
│   ├── TASKS.md
│   └── summaries/YYYY-MM-DD.md
│
├── next.config.js
├── middleware.ts                 # Supabase session refresh
└── package.json
```

## Backend rules

- **Route handlers live in `app/api/<path>/route.ts`.** They are CJS-compiled on Vercel, so dynamic `import()` of third-party packages must be Vercel-safe. Anything with a worker (`pdfjs-dist` 4.x) or native binding must be either `serverComponentsExternalPackages` or replaced (we chose replace — `pdf-parse` instead).
- **All quota / plan / billing constants live in [`lib/pricing.ts`](../lib/pricing.ts).** Routes import from there. Adding a new limit? One constant, all UI + API + JSON-LD copy auto-updates.
- **Supabase access uses three clients:**
  - **Server (`createSupabaseServerClient`)** — for routes that run as the user. Respects RLS.
  - **Admin (`createSupabaseAdminClient`)** — bypasses RLS. Use **only** for paths the user can't do themselves: payment verification, signup metadata write, anon-id claim on signup, anonymous resume_uploads insert.
  - **Browser (`createSupabaseBrowserClient`)** — for client components. RLS-respecting.
- **RLS policies are defined in [`supabase/schema.sql`](../supabase/schema.sql) and individual migration files.** Each user can read/write only their own rows. Migrations are idempotent (`if not exists`, `drop policy if exists`, etc.) so re-running is safe.
- **Migrations are append-only.** Never edit a numbered migration after it's shipped. Add a new one.
- **All Groq calls go through `lib/llm.ts:generateATSContent()`.** Token budget enforcement + 413 auto-shrink-retry are centralised there — don't bypass.

## Frontend rules

- **Server components by default; `'use client'` only when needed** (state, refs, event handlers).
- **Metadata is generated by Next 14's Metadata API in [`app/layout.tsx`](../app/layout.tsx).** Per-route overrides in each route's `page.tsx` via `export const metadata = { ... }`. The `title` template (`'%s — kairesume'`) handles suffix automatically.
- **Structured data (JSON-LD) is rendered as `<script>` tags in `<head>`.** Four blobs ship site-wide: `Organization`, `WebApplication`, `HowTo`, `Person` (founder). Home page adds a fifth: `FAQPage`.
- **All blocking client code is dynamically imported** (`html2pdf.js`, `@turbodocx/html-to-docx`, `jszip`). They only load when the user clicks Download.
- **No third-party trackers, no fingerprinting scripts.** Vercel Analytics is first-party, GDPR-friendly.

## Auth flow

1. `/signup` → POST `/api/auth/signup` → `supabase.auth.signUp({ email, password, options: { emailRedirectTo } })`.
2. The auto-create trigger `handle_new_user()` inserts a `profiles` row with the user's id + email.
3. The signup route then upserts geo-IP / OS / browser metadata via the admin client (best-effort, never blocks signup).
4. It also claims any anonymous `resume_uploads` rows by `anon_id` → `user_id`.
5. Email confirmation link uses `NEXT_PUBLIC_SITE_URL` (with the request-origin as fallback). **The Supabase dashboard's "Site URL" setting must also be `https://kairesume.fit` — the email link target is built from that, not from code.**
6. `middleware.ts` refreshes the Supabase session on every request that isn't a static asset.

## Generation pipeline

```
upload PDF/DOCX
  │
  ▼
extractTextFromFile()  ─── pdf-parse (primary) → pdfreader (fallback)
  │
  ▼
compressText()  ─── strip whitespace / page numbers / EEO boilerplate / URL paths
  │
  ▼
truncateToTokenBudget()  ─── JD ≤ 2500 tok, resume ≤ 4500 tok (chars/3 estimator)
  │
  ▼
generateATSContent()  ─── lib/llm.ts → Groq(llama-3.3-70b-versatile, JSON mode)
  │                       budget: 12K TPM, 1200 safety, max_tokens 6000
  │                       413 auto-recovery: shrink jd 60% / resume 40%, retry once
  ▼
parseJSONResponse()  ─── tolerant: handles nested misshapes, refuses truncated output
  │
  ▼
{ personalInfo, jobRole, jobCompany, resume HTML, coverLetter HTML, scores, keywords }
  │
  ▼
client-side render
  ├── ResumePreview (blurred if anonymous)
  ├── renderPdfBlob()   ─── html2pdf.js (A4, 12mm margins)
  └── renderDocxBlob()  ─── @turbodocx/html-to-docx (US Letter, Calibri 11pt)
       │
       ▼
     JSZip → <role>_<company>_<fullname>.zip { 2x pdf, 2x docx }
```

## Important constraints

### Groq token budget (8000 → 12000)

- Free-tier ceiling on `llama-3.3-70b-versatile` is **12 000 TPM**. `lib/llm.ts` reserves a **1 200-token safety margin** because Groq's tokenizer counts URL paths, code, and unusual punctuation higher than our `chars/3` estimator predicts.
- Per-input caps are enforced before the Groq call: **JD ≤ 2 500 tokens, resume ≤ 4 500 tokens**. Long inputs get truncated at a sentence/paragraph boundary in `lib/utils.ts:truncateToTokenBudget()`.
- If Groq still returns 413, `generateATSContent` shrinks JD to 40% / resume to 60% and retries **once**. User-facing failures are rare.

### Free-tier quota

- **Anonymous: 1 generation** (`ANON_FREE_GENERATIONS`). Counter in a signed HTTP-only cookie.
- **Signed-in free: 10 / month** (`SIGNED_IN_FREE_GENERATIONS`). Stored in `profiles.generations_count`.
- **Hard gate fires before the LLM call** — used to fire after, which produced over-counted rows. Migration `006_clamp_free_generations.sql` cleans up legacy over-counts.
- **Pro: unlimited.** `effectivePlan()` treats Pro as expired once `pro_until` is past.

### ATS-friendly output (do not regress)

- Resume HTML must use ONLY `<h2>`, `<h3>`, `<p>`, `<ul>`, `<li>`, `<strong>`.
- **No tables, no columns, no graphics, no headers/footers** — most ATS parsers fail on those.
- The prompt explicitly says **preserve completeness**: every job, skill, bullet from the original must appear. Llama 3.3 was over-summarising before the "PRESERVE COMPLETENESS" rule landed.

### PDF page-break rules

- `app/page.tsx`'s html2pdf options use `pagebreak.mode: ['css', 'legacy']` — NOT `'avoid-all'` (which over-shifts content and produced near-empty page 1s).
- `<p>` and `<h3>` get `page-break-inside: avoid` so short entries (Education rows, Skills lines, single-line job titles) don't get sliced mid-glyph.
- `<h2>` / `<h3>` get `page-break-after: avoid` so headings don't orphan.

### Crypto verification

- TRC-20 hashes are bare 64 hex chars; ERC-20 hashes are 0x-prefixed. `lib/crypto.ts:normalizeTxHash()` handles both.
- `lib/crypto.ts:verifyUsdtTransfer(chain, ...)` dispatches: TRC-20 → TronGrid REST; ERC-20 → Etherscan V2 (`chainid=1`).
- Each chain has its own min-confirmations setting (TRC-20: 19 blocks ≈ 1 min; ERC-20: 12 blocks ≈ 3 min). The verify route returns "Awaiting confirmations (N/M)" so users can retry.

### Cloudflare quirks

- Cloudflare proxies `kairesume.fit`. Two known side effects:
  - **`Content-Signal: search=yes,ai-train=no`** is auto-injected into `robots.txt` responses. It contradicts our explicit AI-allowlist. Disable via Cloudflare dashboard → Security → Bots → AI Audit.
  - **Bot Fight Mode** can challenge Googlebot on `/sitemap.xml`. If Search Console reports "Couldn't fetch", check Bot Fight Mode is off and verified-bot allow is enabled.

## Env vars

Required in production (set in Vercel dashboard):

| Variable | Purpose |
|---|---|
| `GROQ_API_KEY` | LLM provider |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or legacy `_ANON_KEY`) | Supabase client-side key |
| `SUPABASE_SECRET_KEY` (or legacy `SUPABASE_SERVICE_ROLE_KEY`) | Admin client; needed for signup metadata + anon claim + payments |
| `USAGE_COOKIE_SECRET` | HMAC secret for `kairesume_usage` and `kairesume_anon_id` cookies |
| `NEXT_PUBLIC_SITE_URL` | Drives signup confirmation email redirect; defaults to `https://kairesume.fit` |
| `OWNER_USDT_TRC20_ADDRESS` | Tron base58 wallet receiving USDT (TRC-20) |
| `OWNER_USDT_ERC20_ADDRESS` | EVM 0x wallet receiving USDT (ERC-20) |
| `ETHSCAN_API_KEY` (or `ETHERSCAN_API_KEY`, `BSCSCAN_API_KEY`) | Etherscan V2 unified API key for ERC-20 verification |
| `TRONGRID_API_KEY` | Optional; lifts rate limits on TRC-20 verification |
| `TAVILY_API_KEY` | Optional; enables external company research for the cover letter. Without it the cover letter is generated from the JD alone. Free tier: 1000 queries/month. |
