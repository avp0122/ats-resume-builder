# Decision history

ADR-style log of consequential decisions. Append-only. Newest at the bottom. When a decision is reversed, leave the old entry in place and add a new one explaining the reversal — context for future-me.

Format: **ID · YYYY-MM-DD · status** — one-line decision. Body explains the reason and consequences.

---

### 001 · 2026-05-12 · Active

**Stack: Next.js 14 (App Router) + TypeScript + Tailwind + Supabase + Groq + Vercel**

Chose Next 14 App Router for file-convention routing + serverless functions on the same Vercel deploy. Supabase covers auth + Postgres in one free tier. Groq picked over OpenAI for free-tier TPM cost (no card required, fast inference). Vercel because the dev → prod flow is one `git push`. Tailwind because we don't want to maintain a design system for a small product.

---

### 002 · 2026-05-12 · Active

**Anonymous users see ATS score but resume preview is blurred until signup**

The product's value is the rewrite, not the score. Showing the rewrite for free with no signup → no conversion. Showing nothing → user can't see if the tool worked. Blurred-with-CTA hits the middle: the user sees we did real work, but has to sign up to actually read or download it. `BlurGate` in [`app/page.tsx`](../app/page.tsx) renders a CSS blur over `ResumePreview` with a sign-up overlay on top. Anonymous users also see a disabled "Download (sign up)" button.

---

### 003 · 2026-05-12 · Superseded by 005

**Quota tiers: 1 anon, 3 signed-in/month, unlimited Pro**

Started with these numbers as a guess. 3 was too tight (legitimate users hit the cap weekly — typical job hunt is 3–5 apps/week).

---

### 004 · 2026-05-13 · Active

**`profiles` table stores USER state only; per-resume contact info lives in `resume_uploads`**

Initial schema put `full_name`, `phone`, `location`, `social_links` on `profiles` and the generate route backfilled them from each upload. Wrong: those fields describe a *specific resume*, not the account — a user can legitimately upload three different resumes for three different roles with different contact blocks. Migration `008_profiles_user_info_only.sql` dropped the columns from profiles; per-upload rows in `resume_uploads` (added in migration 004) hold the contact block per generation.

---

### 005 · 2026-05-18 · Active (supersedes 003)

**Bumped signed-in free tier from 3 → 10 generations / month**

3 was too tight. 10 covers a typical week's worth of job applications without forcing Pro upgrade. Higher than 10 starts to look like abuse / per-employer mass output, which Pro is for. One-line change in `lib/pricing.ts:SIGNED_IN_FREE_GENERATIONS`. All gating logic + copy already references the constant so the behaviour change ships without further code edits (audited in PR #37).

---

### 006 · 2026-05-13 · Active

**Anonymous resume uploads stored against a signed cookie `anon_id`, claimed on signup**

`resume_uploads.user_id` was originally `NOT NULL`. Anonymous generations had nothing to attach to and were lost. Migration `011_resume_uploads_anon.sql` made `user_id` nullable, added `anon_id` text, and a `CHECK ((user_id IS NOT NULL) XOR (anon_id IS NOT NULL))` invariant. New cookie `kairesume_anon_id` (HMAC-signed, 1-year expiry) tracks the visitor. On signup, `/api/auth/signup` runs `UPDATE resume_uploads SET user_id = $new, anon_id = NULL WHERE anon_id = $cookie` to claim the history, then clears the cookie.

---

### 007 · 2026-05-14 · Active

**Crypto payment chains: TRC-20 (Tron) + ERC-20 (Ethereum)**

Went through several iterations: started with TRC-20 → swapped to BEP-20 (BSC) → added ERC-20 alongside BEP-20 → dropped BEP-20 back out. Final state is TRC-20 + ERC-20. Reasoning: TRC-20 has the lowest fees and is the most common USDT chain among crypto-native users; ERC-20 is the universal fallback expected by anyone on a major CEX. BEP-20 was redundant with TRC-20 for the fee story and added a third verifier to maintain.

---

### 008 · 2026-05-14 · Active

**Etherscan V2 unified API for ERC-20 verification; TronGrid for TRC-20**

Etherscan rolled BscScan + Etherscan into one V2 endpoint (`api.etherscan.io/v2/api`) with `chainid` as a query param. One API key works for every EVM chain. TRC-20 is not EVM — different REST API, different address format (base58 starting with "T"), different signature parsing. `lib/crypto.ts:verifyUsdtTransfer(chain, …)` dispatches: TRC-20 → TronGrid REST; ERC-20 → Etherscan V2 (chainid=1).

---

### 009 · 2026-05-14 · Active

**Multi-tier Pro pricing: 1mo / 3mo (-20%) / 1yr (-30%)**

Monthly-only pricing made the prepay discount math implicit (users had to do it themselves). Three explicit tiers in `PRO_TIERS` give a clear ladder. `PlanId` stays `'free' | 'pro'` in the DB; the period selection only controls the `pro_until` extension. Checkout page has period + chain pickers that don't re-mount the invoice card on every change (cleaner UX).

---

### 010 · 2026-05-15 · Active

**Free customer support: floating popup widget, not a dedicated page**

A dedicated `/support` page is one click + one URL away — too friction-heavy for "I just want to say this is broken". Floating bottom-right button is one click. Required fields: title + email + message. Phone optional. Backed by `support_tickets` table (RLS: users insert/read their own; admin reads inbox).

---

### 011 · 2026-05-15 · Active

**Capture OS / browser / version / geo-IP / IP on `profiles` at signup time**

Useful for support ("user reports issue on iOS 18 Safari"), abuse detection (signups from same IP in burst), and account verification ("this looked like an unfamiliar location"). UA parsed server-side from headers; geo-IP via `ipapi.co` (best-effort, 2-second timeout, never blocks signup). Migration `010_profiles_signup_meta.sql`.

---

### 012 · 2026-05-15 · Active

**Hard quota gate fires BEFORE the LLM call, not after**

Original code called the LLM, then decided `downloadAllowed=false` if the user was over cap. Two bugs: (a) we paid for an LLM call the user wasn't allowed to use, (b) the counter kept growing past the limit producing "6/3" / "7/3" rows in the DB. New gate in `/api/generate` returns 402 with `upgradeRequired: true` if `preGenCount >= SIGNED_IN_FREE_GENERATIONS`. The 402 response also opportunistically clamps over-counted rows back to the limit. Migration `006_clamp_free_generations.sql` cleaned up legacy over-counts.

---

### 013 · 2026-05-16 · Active

**PDF text extraction: `pdf-parse` primary, `pdfreader` fallback**

`pdfjs-dist` 4.x is the modern Mozilla renderer and worked great in local dev. On Vercel serverless it always tried to dynamic-import its worker file (`pdf.worker.mjs`), which webpack didn't ship in the lambda — producing "Setting up fake worker failed: Cannot find module" at runtime. Tried four fixes (worker disable, `serverExternalPackages`, `eval('require')`, `outputFileTracingIncludes`) — each broke a different way. Switched to `pdf-parse`, which wraps `pdfjs-dist` 1.10 internally with no worker. Boring, battle-tested, just works on Vercel.

---

### 014 · 2026-05-16 · Active

**Groq model swap: `gpt-oss-120b` → `llama-3.3-70b-versatile`**

`gpt-oss-120b` had an 8K TPM free-tier cap and we were hitting it constantly even with aggressive input compression. `llama-3.3-70b-versatile` is 12K TPM (+50%) with comparable JSON-mode reliability for our ATS rewrite use case. Side effect: Llama 3.3 is biased toward concise output — required adding the "PRESERVE COMPLETENESS" rule to `lib/prompts.ts` so it stops over-summarising 8-job resumes into 2 jobs.

---

### 015 · 2026-05-16 · Active

**Token estimator uses `chars/3` (was 4, then 3.5)**

After two real-world "Requested 8XXX, Limit 8000" breaches, settled on `chars/3` as the pessimistic estimator. URL-heavy and code-heavy inputs tokenise ~17% above what `chars/4` predicts; `chars/3` absorbs that gap. Belt + braces: `lib/llm.ts` also auto-retries on 413 with shrunk inputs (jd → 40%, resume → 60%) before bubbling the error.

---

### 016 · 2026-05-17 · Active

**Pricing constants are the single source of truth for all copy**

Every "3 / month" or "10 generations" string in the codebase was a fresh source of drift. Now `lib/pricing.ts:SIGNED_IN_FREE_GENERATIONS` is interpolated into: API error messages, FAQ entries, hero tier badges, JSON-LD `Offer.description`, `llms.txt`, PaywallCard sub-text, Account-page stat. Future quota changes are one constant edit.

---

### 017 · 2026-05-17 · Active

**Explicit AI crawler allowlist in `robots.txt`**

The wildcard `User-agent: *` block functionally allowed every UA, but AEO / GEO best practice is to list AI crawlers explicitly — many of them look for their own UA before falling back to `*`. Listed: OpenAI (GPTBot / ChatGPT-User / OAI-SearchBot), Anthropic (ClaudeBot / anthropic-ai / Claude-Web), Common Crawl, Perplexity, Google-Extended, Applebot-Extended, Meta-ExternalAgent, Bytespider, Amazonbot, DuckAssistBot, YouBot, cohere-ai, mistral-ai. Cloudflare's auto-injected `Content-Signal: ai-train=no` header contradicts this — disable in Cloudflare dashboard for consistency.

---

### 018 · 2026-05-17 · Active

**Five JSON-LD schemas in `<head>`: Organization, WebApplication, HowTo, FAQPage, Person**

Site-wide in `app/layout.tsx`: Organization (brand box in Google + answer engines), WebApplication (rich snippet with all three Pro `Offer` tiers), HowTo (the 4-step generation flow with `totalTime: PT1M`), Person (founder — links the product to a real human for trust signals). Home page adds FAQPage with 10 sentence-level Q/A pairs phrased to match common search + chat queries.

---

### 019 · 2026-05-18 · Active

**DOCX output ships alongside PDF in the same ZIP**

Many ATS parsers (Workday, Greenhouse, Lever, iCIMS, Taleo) read DOCX more reliably than PDF — they extract real Office Open XML rather than re-deriving text from PDF glyph positions. ZIP now contains 4 files: `<name>_resume.pdf`, `<name>_resume.docx`, `<name>_coverletter.pdf`, `<name>_coverletter.docx`. DOCX generated client-side via `@turbodocx/html-to-docx` (browser-safe, modern OOXML). Same Promise.all batch as PDF rendering — total prep time is max-of-four, not sum.

---

### 020 · 2026-05-18 · Active

**In-place PDF style preservation declined; multi-template picker recommended instead**

User asked whether we could replace text in the original uploaded PDF in-place so the original visual style survives. Investigated: `pdf-lib` can do whiteout+redraw, but rewritten content length almost never matches the original (different bullet count, different keyword density), so text overflows or leaves gaps. Plus most uploaded "pretty" resumes (Cake Resume, Canva) are ATS-hostile by construction — preserving them defeats the rewrite's purpose. **No code change shipped.** Future option: multi-template picker (Modern / Classic / Compact) — gives users visual choice without breaking the rewrite. See open issue.

---

### 021 · 2026-05-26 · Active

**Third stored `plan` value: `'staff'` — unconditional Pro for comped accounts**

Need a way to grant unlimited generations to specific users (staff, friends-of-the-house, manual comps) without setting a sentinel future `pro_until` date. Chose to extend `effectivePlan()` in [`lib/plan.ts`](../lib/plan.ts) to map `plan === 'staff'` → effective `'pro'` unconditionally. Three reasons over the sentinel-date approach: (1) queryable as a distinct cohort in the DB (`where plan = 'staff'`), so analytics on "non-paying-but-unlimited" stay clean; (2) no risk of a far-future date silently expiring; (3) `'staff'` is deliberately NOT added to the purchasable `PlanId` union in `pricing.ts` — the UI cannot offer it. Grant via SQL: `update profiles set plan='staff' where id='<uuid>'`. Revoke by setting back to `'free'`. No migration required (the `plan` column is free `text`, no CHECK constraint).

---

### 022 · 2026-05-26 · Active

**Blog at `/blog`: MDX files in `content/blog/*.mdx`, rendered server-side via `next-mdx-remote/rsc`**

Need a blog for SEO / AEO / GEO surface area — practical guides on ATS parsing, DevOps keywords, remote applications. Chose MDX-files-in-repo over a Supabase-backed CMS because: (1) every URL is statically rendered HTML at build/ISR time (great SEO, near-zero runtime cost); (2) posts are git-tracked with proper review, no admin UI to build or secure; (3) MDX leaves the door open to embed CTA components inside posts later without rewriting the engine. Implementation uses `next-mdx-remote@^4.4.1` (the App-Router-compatible major; v4's `/rsc` subpath runs entirely as a Server Component, zero client JS for post bodies) + `gray-matter` for frontmatter. Routes: `/blog` (index) + `/blog/[slug]` (detail), both with `revalidate = 86400` for ISR. Sitemap dynamically enumerates posts via [`lib/blog.ts:listPosts()`](../lib/blog.ts). JSON-LD: `Blog` on the index, `BlogPosting` on each post. Five seed posts ship in this PR covering ATS parsing, DevOps keywords, cover letters, France→remote, and Canva/Cake-style design pitfalls.

---

### 023 · 2026-05-26 · Active

**Recent-jobs aggregator at `/jobs`, ISR-cached daily, sourced from RemoteOK + Remotive**

User-side intent: an applicant in France, looking for global-remote DevOps / SRE / Cloud roles posted in the last 24 hours. Considered building our own scraper or paying for an API; chose to aggregate two free public APIs (RemoteOK + Remotive) server-side and cache the page with `revalidate = 86400` (24h). This satisfies both APIs' ToS guidance ("max ~4 fetches/day" each — we do 1) and keeps render cost near-zero. Filter pipeline in [`lib/jobs.ts`](../lib/jobs.ts): (1) role regex `devops|sre|site reliability|cloud|platform|kubernetes|infrastructure`; (2) posted ≤ 24h; (3) `candidate_required_location` doesn't strictly geo-lock away from France (we reject `*Only` phrases but accept Worldwide / Europe / France / unspecified). Two-source fan-out via `Promise.all` so one source failing doesn't blank the page; dedupe by `company|title`. ToS compliance: per-row `Source: Remote OK / Remotive` badge + a footer attribution line + outbound `target=_blank rel=noopener` (deliberately NOT `nofollow` per RemoteOK's request). Empty-state shows when no fresh matches, linking to the France→remote blog post and the generator. The page is intentionally just links — clicking takes the user to the source listing to apply, kairesume does not host applications.

---

### 024 · 2026-05-26 · Active

**One resume per signed-in profile; generation becomes job-description-only**

Reframed the signed-in flow. Old model: upload a resume on every generation. New model: signed-in users upload their resume **once** on `/account`, the extracted text is stored on the profile, and per-generation they only paste the job description. The home page hides the upload UI for signed-in users with a stored resume; it redirects to `/account?firstResume=1` for signed-in users without one. Anonymous users still upload per-generation (no profile to attach to).

Schema: migration 012 adds `profiles.resume_text` (TEXT), `profiles.resume_filename` (TEXT, display-only), `profiles.resume_uploaded_at` (TIMESTAMPTZ). Only the extracted text is stored — the original PDF/DOCX is dropped after extraction at `POST /api/profile/resume`. The user can clear it via `DELETE /api/profile/resume`.

Generate route: `/api/generate` was `resume file is required`; it now accepts either an uploaded file OR no file (and reads `profiles.resume_text`). Order of preference: explicit upload wins (allows ad-hoc overrides for a specific role); fallback to stored text when no file is in the request; 400 with `missingResume: true` if neither.

Trade-offs:
- Faster generations: PDF parsing happens once per upload, not once per generate.
- Lower drop-off: most return users were re-uploading the same file each time.
- Privacy footer copy updated: "Job descriptions discarded after generation. Stored resume text removable anytime from your account." Honest about what we keep and where the kill switch is.

[`app/page.tsx`](../app/page.tsx) became a Server Component (auth + profile read + redirect); the existing 1295-line client component was renamed to [`app/HomeClient.tsx`](../app/HomeClient.tsx) and now accepts `signedIn` + `storedResumeFilename` props. The upload widget on `/account` is [`components/ResumeSettings.tsx`](../components/ResumeSettings.tsx).

---

### 025 · 2026-05-26 · Active

**Staff users can force-refresh `/jobs` immediately (cache-invalidation, not bypass)**

The `/jobs` page is ISR-cached for 24h to stay inside Remote OK / Remotive's "max ~4 fetches/day each" ToS guidance (DECISION 023). For internal users on the `'staff'` plan (DECISION 021) we wanted a manual override — "I'm doing a demo, pull fresh data now" — without giving every visitor that power (which would burn through the daily quota in minutes).

Implementation in three pieces:
1. The two source fetches in [`lib/jobs.ts`](../lib/jobs.ts) now carry `next.tags: ['jobs']` so they're individually invalidatable.
2. [`app/jobs/actions.ts:refreshJobs()`](../app/jobs/actions.ts) is a Server Action that re-verifies the caller is staff, then calls `revalidateTag('jobs')` + `revalidatePath('/jobs')`. Non-staff get a `{ ok: false, reason: 'not-staff' }` no-op.
3. [`components/RefreshJobsButton.tsx`](../components/RefreshJobsButton.tsx) is a client component that polls [`/api/me/staff`](../app/api/me/staff/route.ts) on mount and only renders if `isStaff === true`. Clicking calls the server action and `router.refresh()`'s on success.

The staff check happens on the server in `refreshJobs()` — the client-side rendering gate is purely UX. Tampering with the rendered HTML to expose the button doesn't bypass the quota protection.

---

### 026 · 2026-05-26 · Active (amends 021)

**`profiles.plan` actually had a CHECK constraint; migration 013 expands it to include `'staff'`**

DECISION 021 stated "no migration required" because the local migrations directory didn't mention a CHECK constraint on `profiles.plan`. That was wrong — the constraint `profiles_plan_check` was added at table creation, before the repo's tracked migrations begin at 002, and restricts the column to `('free', 'pro')`. The first attempt at `update profiles set plan='staff' where id='...'` failed in production with:

```
ERROR: 23514: new row for relation "profiles" violates check constraint "profiles_plan_check"
```

[Migration 013](../supabase/migrations/013_profile_plan_allow_staff.sql) drops the old constraint and recreates it as `check (plan in ('free', 'pro', 'staff'))`. Idempotent. Production was patched by running the equivalent SQL by hand before this migration shipped; the migration file exists so any future fresh DB (staging, fork, migrated project) gets the correct constraint without manual intervention.

Lesson for future schema work: when claiming "no migration required" because the column is `text`, also check for CHECK constraints on the column. `\d+ public.profiles` in psql or the Supabase Table Editor's constraint inspector both surface them.

---

### 027 · 2026-05-26 · Active

**Cover letter: humanized prompt + defensive `<p>` normalization + clean copy output**

Two bugs in one feature:

**Output was corporate-template-flavored.** The original cover-letter section of [`lib/prompts.ts`](../lib/prompts.ts) just said "3-4 short paragraphs in `<p>` tags." Llama 3.3 reliably produced something like "I am excited to apply for the X position at Y, where I can leverage my experience in… I am confident that my skills make me a strong fit… Thank you for considering my application." Generic, filler-heavy, nothing about the specific company. Tightened the prompt with: a banned-phrase list (every common corporate-template tell), a forced structure (Hook → Proof → Bridge → Close), required specificity (at least one proper noun from the JD in paragraph 1, one specific story + number from the resume in paragraph 2), and a 280-word cap.

**Output didn't survive Copy-to-clipboard.** User report: pasted cover letter was all run-on with no paragraph breaks, plus mysterious 2- and 4-space leading indents per line. Two causes:
1. The LLM was sometimes returning the whole body as one giant `<p>` (or `<br>`-separated lines) instead of one `<p>` per paragraph, despite the prompt saying otherwise. Without `<p>` boundaries, the browser's `innerText` produced one run-on string.
2. The HTML template literal in [`lib/resumeTemplate.ts:renderCoverLetterDocument`](../lib/resumeTemplate.ts) had source-code indentation (2 spaces per nesting level). Those source-side spaces leaked into `innerText` output in some browser contexts (notably Safari's reading of detached DOM nodes).

Fixes:
- New [`normalizeCoverLetterHtml()`](../lib/llm.ts) in `lib/llm.ts` runs on every LLM response. If the body has ≥2 well-formed `<p>` tags AND no monolithic single-paragraph case, leave it alone (with `<br><br>` → `</p><p>` cleanup). Otherwise strip all tags, split on blank lines / single newlines / sentence-ends as progressive fallbacks, and rebuild as proper `<p>…</p>` blocks. Always produces something copyable.
- `renderCoverLetterDocument` rewritten to emit a single-line HTML string with no source indentation.
- [`htmlToPlainText`](../components/ResumePreview.tsx) hardened to inject explicit `\n\n` at block boundaries before letting the browser flatten — no longer depends on `innerText`'s browser-specific layout-aware whitespace insertion.

---

### 028 · 2026-05-26 · Active

**Cover letter enriched with external company research via Tavily Search API**

DECISION 027 humanized the prompt but the cover letter still anchored entirely on whatever the JD said about the company — which is usually marketing copy or boilerplate. To produce a letter that actually shows the candidate knows what the company *does*, we now do a second LLM pass enriched with fresh search results.

**Architecture:** two-pass. First pass (existing) generates resume + first cover letter + scores. If `TAVILY_API_KEY` is set AND the model extracted a non-empty `jobCompany`, we then:
1. Call [`researchCompany(jobCompany)`](../lib/companyResearch.ts) — POSTs to `https://api.tavily.com/search` with `search_depth: 'basic'`, `max_results: 3`, `include_answer: true`. 3.5s timeout. Returns 1-3 concatenated snippets capped at 600 chars.
2. Call [`regenerateCoverLetterWithContext()`](../lib/llm.ts) — a shorter second LLM pass using [`getCoverLetterPrompt()`](../lib/prompts.ts) that re-grounds paragraph 1 on a fact from the Tavily summary (product name, customer, mission, recent move) instead of just the JD's self-description.
3. Swap the new cover letter into the result before caching.

**Why Tavily over alternatives:**
- Free tier: 1000 queries/month — enough for a small product.
- Designed for AI agents: results include synthesised `answer` field that often replaces our snippet-concatenation step entirely.
- One HTTP call, no client setup, no LangChain.

**Fail-soft at every step:**
- No `TAVILY_API_KEY` → skip enrichment silently (production-safe to deploy without the key).
- Tavily HTTP error / timeout / empty result → keep first-pass cover letter.
- Second LLM call fails or returns malformed JSON → keep first-pass cover letter.
- Any exception in the enrichment block is caught and logged — never blocks the main response.

**429 specifically (free-tier quota exhausted):** the helper logs loudly (not silently) so you can spot it in Vercel function logs without dev-mode flags — the message is `Tavily rate limit hit (429) for "{company}" — falling back to JD-only cover letter. Free-tier quota exhausted or per-second cap exceeded.` When this fires, the user still gets the **humanized JD-only cover letter** from the first-pass `generateATSContent` (the humanization in DECISION 027 is the floor — every cover letter shipped is at least this good even without Tavily). 401/403 errors get a similar dedicated message pointing at the API key.

**Cost:** ~+1 Tavily query + ~+1k Groq tokens per generation. Tavily free tier covers a small product; Groq token cost stays under the 12K TPM budget (first call ≈ 7K, second call ≈ 1k).

**TPM consideration:** the second call is small enough that we don't expect new TPM breaches. If we ever see them, the simplest mitigation is to gate enrichment behind `plan === 'pro' || plan === 'staff'` (only paying / comped users get the deeper research) — currently universal because the cost is low.

---

### 029 · 2026-05-26 · Active

**`/jobs` is now staff-only; non-staff users see a real 404**

Initial DECISION 023 made `/jobs` public — aggregated job listings as a small SEO surface. After watching usage, the page is better positioned as an internal tool for the owner / team rather than a public marketing page. Reasons: (1) the curated 24h list isn't dense enough to compete with dedicated job boards for SEO ranking; (2) keeping the page public means the Tavily-style enrichment ideas (deeper company research, contact discovery, etc.) would need privacy review; (3) the 1000-query Tavily free tier becomes a bottleneck if the page becomes popular.

Implementation:
- [`app/jobs/page.tsx`](../app/jobs/page.tsx) now reads the session server-side, checks `profile.plan === 'staff'`, and calls `notFound()` for everyone else. The 404 is genuine — the page reports itself as not-found, not as forbidden, so non-staff visitors don't even learn the URL exists.
- `export const dynamic = 'force-dynamic'` since we now read cookies. The underlying Remote OK + Remotive fetches in [`lib/jobs.ts`](../lib/jobs.ts) keep their 24h `next.tags: ['jobs']` caching, so making the page dynamic doesn't re-hit the source APIs per request.
- Page-level `metadata.robots: { index: false, follow: false }` so even if a search engine somehow discovers the URL it won't index.
- [`app/sitemap.ts`](../app/sitemap.ts) no longer lists `/jobs`.
- [`components/Navbar.tsx`](../components/Navbar.tsx) gates the Jobs link on `session.plan === 'staff'`. The navbar already fetches the raw plan from `profiles.plan`, so this needs no extra round-trip — the plan type was extended from `'free' | 'pro'` to `'free' | 'pro' | 'staff'`.
- [`components/Footer.tsx`](../components/Footer.tsx) wraps the Jobs link in a new client component [`StaffOnlyFooterLink`](../components/StaffOnlyFooterLink.tsx) that polls `/api/me/staff`. This avoids forcing the Footer (a Server Component used on every page) to read auth cookies, which would force-dynamic the entire site.
- The `RefreshJobsButton` and `/api/me/staff` endpoint from DECISION 025 are reused unchanged.

Security boundary is the server-side `notFound()` call in `page.tsx`. The navbar/footer gates are UX only — if someone forged the staff API response client-side, the page would still 404 them.

To re-public the page later: revert `notFound()` to a plain render, re-add `/jobs` to the sitemap, drop the `robots` metadata, ungate the navbar/footer links. Three files, ~10 minutes.

---

### 030 · 2026-05-27 · Active

**Forgot-password flow via Supabase PKCE callback at `/auth/callback`**

Until now there was no self-serve password reset — users who forgot their password had to ask support. Added the standard three-step flow: enter email → click email link → set new password. Implementation choices:

- **Two new pages + three new routes.** [`/forgot-password`](../app/forgot-password/page.tsx) renders [`ForgotPasswordForm`](../components/ForgotPasswordForm.tsx); [`/reset-password`](../app/reset-password/page.tsx) renders [`ResetPasswordForm`](../components/ResetPasswordForm.tsx). The matching API routes are [`POST /api/auth/forgot-password`](../app/api/auth/forgot-password/route.ts) and [`POST /api/auth/reset-password`](../app/api/auth/reset-password/route.ts). A new [`/auth/callback`](../app/auth/callback/route.ts) GET handler does the PKCE code exchange.

- **PKCE callback is reusable.** With `@supabase/ssr`'s default PKCE flow, the link in the reset email points at `/auth/callback?code=<pkce-code>&next=/reset-password`. The handler exchanges the code into a recovery session (cookie set by `@supabase/ssr`'s cookie writer on the response) then forwards to `next`. The same callback can host future flows — magic links, email-change confirmation — by passing a different `next`. Signup-confirm still uses the existing `?confirmed=1` redirect because that flow already works without code exchange.

- **`next` is sanitised on the callback.** Open-redirect protection: only internal absolute paths (`/`-prefixed, not `//`) are honored. Anything else falls back to `/`.

- **Anti-enumeration on the request route.** `/api/auth/forgot-password` returns HTTP 200 unconditionally once basic email-shape validation passes, even when Supabase's downstream call errors. The UI mirrors this — the success message says "*if* an account exists for that email". Without this, a third party could probe our user list one email at a time. Server-side log of failures is preserved so operators can still see real outages.

- **`/reset-password` accepts both recovery sessions AND existing signed-in sessions.** Same `updateUser({ password })` call under the hood. This means a signed-in user can navigate to `/reset-password` directly to proactively change their password — no separate "change password" page needed. Anyone without any session at all bounces to `/forgot-password`.

- **Both new pages are `noindex,nofollow`.** Transactional pages — same treatment as `/jobs` (DECISION 029).

- **"Forgot password?" link added to [`AuthForm`](../components/AuthForm.tsx)** above the password field on signin mode only. Signup doesn't need it.

**Manual setup required:** the Supabase dashboard's "Redirect URLs" allowlist must include `https://kairesume.fit/auth/callback` — otherwise the PKCE exchange will fail with an "Invalid redirect URL" error. Tracked in [`CURRENT_STATE.md`](CURRENT_STATE.md) Manual maintenance §3.

**Why not Supabase's hosted UI?** The hosted UI is OK but doesn't match the rest of our auth screens (dark gradient cards, kairesume branding). Cost of a custom page is one component file per direction; we already have `AuthForm` as the pattern. Cheap.

---

### 031 · 2026-05-27 · Active

**RAG chat foundation: pgvector in Supabase + `gte-small` embeddings via Supabase Edge Functions + n8n ingestion**

The site is getting a chat assistant covering customer support + resume advice + pre-purchase Q&A. This entry documents the foundation (this PR — schema + endpoints, no UI). Inference + widget land in subsequent PRs.

**$0 budget constraint.** Every component picked here uses an already-free resource:

- **Vector store**: new `rag_chunks` table in the existing Supabase, using pgvector + HNSW index. No new infra. Migration 014. 384-dim vectors.
- **Embeddings**: `gte-small` (384-dim) via Supabase Edge Functions' built-in `Supabase.ai.Session('gte-small')`. The model runs on Supabase's infra; we just deploy a thin Deno wrapper at [`supabase/functions/embed/index.ts`](../supabase/functions/embed/index.ts). No API key beyond our existing Supabase project, no per-call billing. Free Supabase tier includes 500K Edge Function invocations/month; we'll use ~10K/month at current scale.
- **LLM** (PR 3): existing Groq Llama 3.3 70B credential.
- **Ingestion orchestrator**: existing partner-owned n8n instance.
- **Quota counters**: new columns on `profiles` (migration 015), cookie for anons.

**Why Supabase Edge Functions for embeddings, not local in our Vercel functions**: First attempt used [`@huggingface/transformers`](https://github.com/huggingface/transformers.js) to run `bge-small-en-v1.5` locally inside a Next.js route. That package transitively pulls in `onnxruntime-node` at ~513 MB — well over Vercel's 250 MB unzipped serverless function size limit. We tried it; deploy failed with `A Serverless Function has exceeded the unzipped maximum size of 250 MB`. Switched before the first successful deploy. The alternatives we evaluated:

  - **OpenAI `text-embedding-3-small`** — ~$0.01 per full reindex (~50K tokens). Genuinely tiny, but introduces a paid credential and a billing relationship the user explicitly wants to avoid.
  - **Hugging Face Inference API free tier** — rate-limited (~1000 req/hr unauth). Risk during ingest bursts and during the first cold start of a chat day.
  - **Cloudflare Workers AI free tier** — 10K embeddings/day, free. But requires a new Cloudflare account and an external service we don't currently use.
  - **Supabase Edge Functions + `Supabase.ai.Session('gte-small')`** — runs on Supabase's infra, free on existing free tier, same 384-dim output, comparable retrieval quality to bge-small-en-v1.5. Uses the stack we already have.

Picked Supabase. `gte-small` and `bge-small-en-v1.5` are both top-rank models in their size class on the MTEB English benchmark; they're not identical but the retrieval quality on FAQ-and-blog content is comfortably above the bar. Both produce 384-dim vectors, so the `rag_chunks.embedding vector(384)` column doesn't change.

**Cross-trust between kairesume, partner-owned n8n, and the Supabase Edge Function**: shared bearer token `RAG_INGEST_TOKEN` (32-byte random hex secret) — env var on Vercel (gates [`/api/rag/sources`](../app/api/rag/sources/route.ts)), Supabase secret on the project (gates the [`embed`](../supabase/functions/embed/index.ts) Edge Function), and `httpHeaderAuth` credential in n8n. All three sides check it with constant-time compare. One secret, three places. Operator rotates by regenerating once and updating all three.

**Why bearer-auth the Supabase Edge Function** even though it can be deployed with `--no-verify-jwt` and reached publicly: the URL is discoverable, and without auth a third party could burn through our free-tier invocation budget. Same secret as `/api/rag/sources` so callers (n8n + PR 3's `/api/chat`) only manage one credential.

**What ships in this PR (foundation only)**:
- [`supabase/migrations/014_rag_chunks.sql`](../supabase/migrations/014_rag_chunks.sql) — pgvector extension, `rag_chunks(id, source, chunk_idx, content, embedding vector(384), updated_at)`, HNSW + source indexes, unique on (source, chunk_idx) for idempotent UPSERT.
- [`supabase/migrations/015_profiles_chat_quota.sql`](../supabase/migrations/015_profiles_chat_quota.sql) — adds `chat_count_today int default 0`, `chat_reset_at timestamptz` to `profiles`. Lazy UTC-midnight reset.
- [`content/faq.md`](../content/faq.md) — 25 entry seed covering pricing, payments, file formats, data storage, refunds, ATS basics, resume best practices.
- [`lib/rag/chunker.ts`](../lib/rag/chunker.ts) — markdown-aware splitter (h2 boundaries → paragraph fallback for oversize). ~2800-char window, 400-char overlap. Tested against the seed corpus: 65 chunks, median 517 chars.
- [`lib/auth/ingestToken.ts`](../lib/auth/ingestToken.ts) — bearer-token check, constant-time compare. Used by `/api/rag/sources`.
- [`app/api/rag/sources/route.ts`](../app/api/rag/sources/route.ts) — bearer-protected GET, returns `[{ source, content }]` for FAQ + blog.
- [`supabase/functions/embed/index.ts`](../supabase/functions/embed/index.ts) — Deno Edge Function with the same bearer-auth surface as the kairesume routes. `POST { inputs: string[] }` → `{ vectors, model: 'gte-small', dim: 384 }`. GET warm-up to preload the session.

**What's deferred to PR 2 (n8n ingest workflow)**:
- n8n workflow: schedule + Vercel deploy webhook → `/api/rag/sources` → chunk via Code node → POST `https://<project>.supabase.co/functions/v1/embed` → Postgres UPSERT into Supabase via pooler → on error, call existing `error_handler` workflow.
- Add Supabase Postgres credential to n8n (pooler URI + service role).
- Add the `RAG_INGEST_TOKEN` `httpHeaderAuth` credential to n8n (one credential, two endpoints).

**What's deferred to PR 3 (chat UI + inference)**:
- `/api/chat` with Vercel AI SDK streaming + Groq Llama 3.3 70B. The query embedding step calls the Supabase Edge Function directly — same auth.
- `components/ChatWidget.tsx` floating bubble (replaces existing Support button; a "Talk to a human" link inside the chat opens the support modal).
- Quota gating using migration 015's columns + new `kairesume_chat_usage` cookie.
- System prompt covering all three personas (support / advice / sales) with refusal rules.

**Manual setup after this PR merges**:
1. Run migrations 014 + 015 on production Supabase.
2. Generate a 32-byte random hex string (`openssl rand -hex 32`).
3. Set it on Vercel as the `RAG_INGEST_TOKEN` env var.
4. Deploy the Supabase Edge Function: `npx supabase functions deploy embed --no-verify-jwt`.
5. Set the same secret on Supabase: `npx supabase secrets set RAG_INGEST_TOKEN=<same-value>`.
6. Wait for redeploys. The endpoints are then live but `rag_chunks` is empty. Chat UI doesn't exist yet (PR 3), so no user impact.

---

### 032 · 2026-06-17 · Active

**RAG chat — UI + inference (PR 3 of 3): Vercel AI SDK 4.x streaming, Groq Llama 3.3 70B, ChatWidget replaces the Support button**

Completes DECISION 031. The foundation (schema + ingest endpoints, PR 1) and the n8n ingest workflow (PR 2) are live; this adds the user-facing chat.

- **`/api/chat`** ([`app/api/chat/route.ts`](../app/api/chat/route.ts)) — `nodejs` runtime (needs cookies + service-role client). Pipeline per turn: (1) quota gate, (2) retrieve grounding, (3) `streamText` from Groq `llama-3.3-70b-versatile` via `@ai-sdk/groq`, returned as `toDataStreamResponse()`.
- **Vercel AI SDK 4.x** (`ai@^4`, `@ai-sdk/groq@^1`) over a hand-rolled SSE stream: `useChat` on the client + `streamText`/`toDataStreamResponse` on the server is the documented happy path and far less code than wiring `ReadableStream` + the Groq streaming protocol by hand. The provider reads the existing `GROQ_API_KEY`, so no new credential. (Install note: `node_modules` is a WSL/Linux tree with POSIX symlinks — installs must run with WSL's npm; Windows npm fails on `.bin` symlinks.)
- **Retrieval** ([`lib/rag/retrieve.ts`](../lib/rag/retrieve.ts)) — embeds the latest user message via the `embed` Edge Function (same `RAG_INGEST_TOKEN` bearer, 8s timeout) then calls the new `match_rag_chunks` RPC (migration 016) with the service-role client. **Non-fatal**: any retrieval failure logs and the chat answers without grounding rather than 500-ing, so a half-provisioned environment degrades instead of breaking.
- **`match_rag_chunks` RPC** (migration 016) — supabase-js can't express `ORDER BY embedding <=> $q LIMIT k` through PostgREST, so cosine top-K lives in a SQL function. `match_count` clamped 1..20; execute revoked from `anon`/`authenticated` (service-role only).
- **Quota** (DECISION 031 numbers) — gate fires BEFORE the LLM call (same rule as DECISION 012). Anonymous 5/day via `kairesume_chat_usage` HMAC cookie ([`lib/chatUsage.ts`](../lib/chatUsage.ts), lazy UTC-day reset); signed-in free 50/day via `profiles.chat_count_today` + `chat_reset_at` ([`lib/rag/chatQuota.ts`](../lib/rag/chatQuota.ts)); Pro/Staff unlimited. Over-limit → 429 with a plan-aware message; the signed-in counter write is best-effort (failure allows the turn rather than hard-blocking).
- **System prompt** ([`lib/rag/systemPrompt.ts`](../lib/rag/systemPrompt.ts)) — one assistant, three personas (support / advice / sales), told to prefer retrieved CONTEXT, be candid when unsure, refuse off-topic, and point users at "Talk to a human" for account-specific issues.
- **ChatWidget replaces SupportWidget in the layout** ([`components/ChatWidget.tsx`](../components/ChatWidget.tsx)). The old support form isn't deleted — `SupportPopup` is now exported from [`SupportWidget.tsx`](../components/SupportWidget.tsx) and reused behind the chat's "Talk to a human" link, so we keep one support form, not two.

**Manual setup before chat is fully grounded in production**:
1. Run migration 016 (`match_rag_chunks`) on production Supabase. Until then the chat works but answers ungrounded.
2. Confirm migrations 014 + 015, `RAG_INGEST_TOKEN` (Vercel + Supabase secret), and the `embed` Edge Function from DECISION 031's setup are actually applied (the n8n workflow being active implies they are, but verify `rag_chunks` has rows).
3. No new env var beyond what DECISION 031 already requires (`GROQ_API_KEY`, `RAG_INGEST_TOKEN`, `NEXT_PUBLIC_SUPABASE_URL`).
