# Current state

> Operational snapshot. **Rewritten in full** whenever something material changes — not append-only. For history see [DECISIONS.md](DECISIONS.md). For active work see [TASKS.md](TASKS.md). For architecture see [ARCHITECTURE.md](ARCHITECTURE.md).

Last updated: 2026-06-17 (chat assistant PR 3 — `/api/chat` + ChatWidget on branch `claude/rag-chat-ui`).

---

## Deployment

- **Production URL:** https://kairesume.fit
- **Host:** Vercel (`avp0122/ats-resume-builder`, default branch `master`)
- **CDN/proxy:** Cloudflare (proxied via DNS, orange cloud)
- **Database:** Supabase (single project, RLS-enabled)

## Tech stack (in one breath)

Next.js 14.2.5 App Router + TypeScript + Tailwind + Supabase auth/db + Groq Llama 3.3 70B for LLM + Tavily for company research + `pdf-parse` (PDF) / `mammoth` (DOCX) for extraction + `html2pdf.js` (PDF render) / `@turbodocx/html-to-docx` (DOCX render).

## Routes

### Public

| Route | Purpose | Render mode |
|---|---|---|
| `/` | Home / generate flow | Dynamic (auth-aware) |
| `/pricing` | Plans + tier comparison | Static |
| `/blog` | Blog index | ISR (24h) |
| `/blog/[slug]` | Post detail (5 seeded) | ISR (24h, SSG'd at build) |
| `/account` | Profile + resume settings | Dynamic |
| `/signin`, `/signup` | Auth | Static |
| `/forgot-password` | Email entry for password reset | Dynamic (reads session to bounce signed-in users) |
| `/reset-password` | Set a new password (post-recovery-email or proactive change) | Dynamic, `noindex,nofollow` |
| `/auth/callback` | PKCE code exchange for Supabase email links | Route handler (GET) |
| `/checkout` | Crypto payment | Dynamic |
| `/terms`, `/privacy` | Legal | Static |
| `/sitemap.xml`, `/robots.txt`, `/llms.txt` | SEO | Static |

### Staff-only (plan = 'staff')

| Route | Purpose | Notes |
|---|---|---|
| `/jobs` | Curated DevOps/SRE/Cloud jobs (last 24h) | `notFound()` for non-staff. Not in sitemap, `noindex,nofollow`. |

### API

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/generate` | Anon-aware | Main rewrite + cover letter (+ optional Tavily enrichment) |
| `POST /api/profile/resume` | Signed in | Upload + extract resume to profile |
| `DELETE /api/profile/resume` | Signed in | Clear stored resume |
| `GET /api/usage` | Anon-aware | Quota + plan info for UI |
| `GET /api/me/staff` | Anon-aware | `{isStaff: boolean}` for client-side gate UX |
| `POST /api/auth/{signup,signin,signout}` | — | Supabase auth proxies |
| `POST /api/auth/forgot-password` | Anon | Send reset-email via Supabase (anti-enumerating) |
| `POST /api/auth/reset-password` | Recovery session or signed-in | Apply new password via `updateUser` |
| `POST /api/chat` | Anon-aware | Chat assistant — quota-gated, RAG-grounded Groq stream (Vercel AI SDK). Embeds the query via the `embed` Edge Function, top-K over `rag_chunks` (RPC `match_rag_chunks`), streams the answer |
| `GET /api/rag/sources` | Bearer (`RAG_INGEST_TOKEN`) | Returns FAQ + blog as `[{source, content}]` for n8n to ingest |
| Supabase Edge Function `embed` | Bearer (`RAG_INGEST_TOKEN`) | Runs `gte-small` via `Supabase.ai.Session` — embedding stays in Supabase infra, not in Vercel functions. Deployed via `supabase functions deploy embed --no-verify-jwt`. URL: `https://<project>.supabase.co/functions/v1/embed`. |
| `POST /api/checkout/{crypto,verify}` | Signed in | USDT TRC-20 / ERC-20 payment + verification |
| `POST /api/support` | Anon | Support ticket submission |

## Plans

| Plan | Quota | Source |
|---|---|---|
| Anonymous | 1 generation/lifetime | Signed `kairesume_anon_id` cookie |
| Free (signed in) | 10 generations/month | `profiles.generations_count` |
| Pro | Unlimited | `plan='pro' + pro_until > now()` |
| Staff (comped) | Unlimited | `plan='staff'` (server-only, no UI to purchase) |

Pro tiers in `lib/pricing.ts:PRO_TIERS`: 1mo / 3mo (-20%) / 1yr (-30%), starting $4.99/mo.

**Chat assistant quota** (per UTC day, DECISION 031): Anonymous 5/day (`kairesume_chat_usage` HMAC cookie), Free signed-in 50/day (`profiles.chat_count_today` + `chat_reset_at`, lazy reset), Pro/Staff unlimited. Limits in `lib/pricing.ts` (`ANON_FREE_CHAT_MESSAGES` / `SIGNED_IN_FREE_CHAT_MESSAGES`). Gate fires before the LLM call (`lib/rag/chatQuota.ts`).

## Database schema

Applied migrations (in `supabase/migrations/`):
- `002` personal_info
- `003` monthly_pro_subscription
- `004` resume_uploads
- `005` resume_uploads_target
- `006` clamp_free_generations
- `007` support_tickets
- `008` profiles_user_info_only
- `009` support_tickets_phone
- `010` profiles_signup_meta
- `011` resume_uploads_anon
- `012` profile_resume — adds `resume_text` / `resume_filename` / `resume_uploaded_at`
- `013` profile_plan_allow_staff — expands `profiles_plan_check` to include `'staff'`
- `014` rag_chunks — pgvector extension + `rag_chunks(id, source, chunk_idx, content, embedding vector(384), updated_at)` with HNSW cosine index
- `015` profiles_chat_quota — adds `chat_count_today int` + `chat_reset_at timestamptz` on `profiles`
- `016` match_rag_chunks — `match_rag_chunks(query_embedding vector(384), match_count int)` RPC for cosine top-K retrieval in `/api/chat` (service-role only; revoked from anon/authenticated)

All applied to production as of 2026-05-26 (migrations 014–016 tracked under chat manual setup below).

**Caveat (DECISION 026):** the original table-creation SQL is not in this repo; `profiles_plan_check` and other constraints may exist on the live DB without a corresponding migration file. Use `\d+ public.profiles` in psql or the Supabase Table Editor to inspect.

## Required environment variables

| Variable | Purpose | Required? |
|---|---|---|
| `GROQ_API_KEY` | Main LLM | **Yes** |
| `NEXT_PUBLIC_SUPABASE_URL` | Auth/DB | **Yes** |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `_ANON_KEY`) | Client-side Supabase | **Yes** |
| `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) | Admin client | **Yes** |
| `USAGE_COOKIE_SECRET` | HMAC for `kairesume_usage` + `kairesume_anon_id` cookies | **Yes** |
| `NEXT_PUBLIC_SITE_URL` | Signup confirmation email redirect | Optional (default `https://kairesume.fit`) |
| `OWNER_USDT_TRC20_ADDRESS` | TRC-20 receive wallet | Yes (for crypto checkout) |
| `OWNER_USDT_ERC20_ADDRESS` | ERC-20 receive wallet | Yes (for crypto checkout) |
| `ETHSCAN_API_KEY` (or `ETHERSCAN_API_KEY`, `BSCSCAN_API_KEY`) | Etherscan V2 for ERC-20 verification | Yes (for crypto checkout) |
| `TRONGRID_API_KEY` | Lifts TRC-20 verification rate limits | Optional |
| `TAVILY_API_KEY` | Cover letter company-research enrichment | **Optional** — feature silently disabled if unset |
| `RAG_INGEST_TOKEN` | Bearer secret for n8n → `/api/rag/{sources,embed}` | **Yes** for the chat ingest pipeline (PR 2+). 32 random bytes, hex-encoded. Endpoints return 503 until set. |

## Active feature flags / runtime conditions

- **Tavily enrichment** runs only when `TAVILY_API_KEY` is set AND the LLM extracted a non-empty `jobCompany` from the JD.
- **Staff features** (refresh button on `/jobs`, `/jobs` access at all) gated server-side on `profiles.plan === 'staff'`.
- **Anonymous flow** continues to work without Supabase env vars (local dev).

## Manual maintenance (currently outstanding)

1. **Cloudflare** — disable `Content-Signal` auto-injection on robots.txt (Security → Bots → AI Audit).
2. **Supabase dashboard — Site URL** → set to `https://kairesume.fit` (currently localhost for confirmation emails).
3. **Supabase dashboard — Redirect URLs** → add `https://kairesume.fit/auth/callback` (required for the password-reset flow's PKCE exchange to succeed). The default `*` wildcard works too but is broader than necessary.
4. **Supabase — run migrations 014 + 015 + 016** on production (pgvector + `rag_chunks` table + `profiles.chat_count_today` / `chat_reset_at` columns + `match_rag_chunks` retrieval RPC). Migrations apply cleanly; no downtime expected. **016 is required for `/api/chat` retrieval** — without it the chat answers without grounding (it degrades, doesn't error).
5. **Generate `RAG_INGEST_TOKEN`** → 32 random bytes (`openssl rand -hex 32`). One value, set in three places:
   1. Vercel env var `RAG_INGEST_TOKEN` (gates `/api/rag/sources`)
   2. Supabase secret `RAG_INGEST_TOKEN` (gates the `embed` Edge Function): `npx supabase secrets set RAG_INGEST_TOKEN=<value>`
   3. (PR 2) n8n `httpHeaderAuth` credential — same value, single credential used for both endpoints
6. **Deploy the `embed` Supabase Edge Function**: `npx supabase functions deploy embed --no-verify-jwt`. Source at `supabase/functions/embed/index.ts`. Returns 503 until step 5.2 is also done.
6. **Google Search Console** — remove + re-add `/sitemap.xml` to force refresh.
7. **Test fixtures** — pin `Liam_Sato_Cake_Resume.pdf` + `Jamal.Hamilton-Resume.pdf` into `/test-fixtures/`.
8. **Vercel env var** — add `TAVILY_API_KEY` (with a rotated dev key) for the Tavily enrichment to actually fire.

## How to grant unlimited access to a user

```sql
update profiles set plan = 'staff' where id = '<user-uuid>';
```

To revoke:

```sql
update profiles set plan = 'free' where id = '<user-uuid>';
```

(`profiles_plan_check` allows `'free' | 'pro' | 'staff'` as of migration 013.)

## How to update the blog

Add an MDX file in `content/blog/<slug>.mdx` with frontmatter:

```yaml
---
title: "..."
description: "..."         # used for <meta>, OpenGraph, index card
date: "YYYY-MM-DD"         # ISO; drives sort + BlogPosting schema
tags: ["ats", "devops"]
readingMinutes: 5
---
```

Then deploy. ISR will pick it up within 24h (or force a rebuild).

## Recent open questions / followups

- **Tavily quota burn rate.** Free tier is 1000 q/month. At ~30 generations/day across all users, we'd run out by mid-month. Watch usage; consider gating enrichment behind Pro+staff if usage grows.
- **Multi-template picker.** Suggested in DECISION 020 as the alternative to in-place PDF preservation. Not yet built. Effort: 1 PR. Files: new `lib/resumeTemplate.ts` variants + a picker on the result page.
