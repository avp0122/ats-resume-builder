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
