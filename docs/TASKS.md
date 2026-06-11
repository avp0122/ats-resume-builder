# Tasks

> Active work state. Newest at the top in each section. Move tasks between sections as state changes. Reference PR numbers + commit hashes for traceability. See [CURRENT_STATE.md](CURRENT_STATE.md) for a deployment / route / env-var snapshot.

Last updated: 2026-06-12.

---

## In progress

- **Chat assistant — RAG foundation (PR 1 of 3).** Schema (migration 014 `rag_chunks` + pgvector HNSW, migration 015 chat-quota columns), `content/faq.md` seed corpus, bearer-protected `/api/rag/sources` + `/api/rag/embed` endpoints, local `bge-small-en-v1.5` embeddings via `@huggingface/transformers`. Foundation only — no chat UI, no `/api/chat` yet. DECISION 031. **Open as PR (TBD)**.
- **Chat assistant — n8n ingest workflow (PR 2 of 3).** After PR 1 merges + `RAG_INGEST_TOKEN` + migrations are applied: schedule + Vercel deploy webhook → `/api/rag/sources` → chunker → `/api/rag/embed` → Postgres UPSERT into Supabase → error trigger to existing `error_handler` Slack alerter. Built via n8n MCP tools.
- **Chat assistant — chat UI + `/api/chat` (PR 3 of 3).** Floating ChatWidget (replaces Support button), Vercel AI SDK 4.x streaming from Groq Llama 3.3 70B, quota gating (Anon 5/day, Free 50/day, Pro/Staff unlimited), system prompt covering support + advice + sales personas. "Talk to a human" link inside chat opens existing support modal.

---

## Next up

### Code work

- **Multi-template picker for the rendered output.** Three variants (Modern / Classic / Compact), all ATS-clean, user picks via a dropdown on the result page. Suggested as an alternative to in-place PDF replacement (declined in DECISION 020). Effort: 1 PR. Files: new `lib/resumeTemplate.ts` variants + a picker on the result page.
- **Pin test fixtures.** Commit `Liam_Sato_Cake_Resume.pdf` (pdfjs-dist worker bug) and `Jamal.Hamilton-Resume.pdf` (Llama 3.3 over-summarisation) into `/test-fixtures/` with a README documenting the regression each one catches.

### Manual / dashboard work (unblocked, just hasn't been done)

- **Run Supabase migrations 014 + 015** on production (pgvector + `rag_chunks` table + chat-quota columns on `profiles`). Required before PR 2 of the chat work can populate the index. DECISION 031.
- **Generate `RAG_INGEST_TOKEN`** (`openssl rand -hex 32`) and set in two places:
  1. Vercel env var `RAG_INGEST_TOKEN` — gates `/api/rag/sources`
  2. Supabase secret: `npx supabase secrets set RAG_INGEST_TOKEN=<value>` — gates the `embed` Edge Function
  Same value goes into n8n as an `httpHeaderAuth` credential during PR 2 setup. DECISION 031.
- **Deploy the `embed` Supabase Edge Function**: `npx supabase functions deploy embed --no-verify-jwt`. Source at `supabase/functions/embed/index.ts`. Required before PR 2's n8n ingest can produce vectors. DECISION 031.
- **Add `https://kairesume.fit/auth/callback` to Supabase dashboard → Auth → URL Configuration → Redirect URLs.** Required for the new forgot-password flow (DECISION 030). Without it, the PKCE exchange fails with "Invalid redirect URL" and the user lands on `/forgot-password?error=...`. A `*` wildcard works too but is broader than necessary.
- **Add `TAVILY_API_KEY` to Vercel env vars.** Without this, the Tavily enrichment from DECISION 028 silently does nothing — every user gets the humanized-but-not-research-enriched cover letter from DECISION 027. Rotate the dev key first (it was pasted in chat).
- **Disable Cloudflare's `Content-Signal: search=yes, ai-train=no` injection.** Contradicts our explicit AI allowlist in `robots.txt` (PR #35). Cloudflare dashboard → Security → Bots → AI Audit / Content Signals → toggle off.
- **Submit `/sitemap.xml` to Google Search Console + Bing Webmaster Tools.** Earlier "Couldn't fetch" likely a stale-status artefact (curl confirms Googlebot can reach it). Remove + re-add in Search Console to force a retry.
- **Update Supabase dashboard "Site URL" setting** to `https://kairesume.fit`. Code-level `emailRedirectTo` is set, but Supabase builds the verify link from the dashboard Site URL setting. Without this, confirmation emails (and reset emails) still link to localhost.

### Monitoring / decisions deferred

- **Tavily quota burn rate.** Free tier 1000 q/month; the enrichment fires per generation. At ~30 generations/day we'd exhaust mid-month. Watch usage; if needed, gate enrichment behind `plan === 'pro' || plan === 'staff'` (per DECISION 028's TPM-consideration note).

---

## Blocked

- *None.*

---

## Open (review pending)

| PR | Title | Branch | Status |
|---|---|---|---|
| — | — | — | All today's PRs merged. |

(Refresh from `gh pr list --state open` for current state — list may be stale.)

---

## Recently completed

Newest first. Strikethrough what's no longer relevant.

- **2026-05-26** — Tavily company research enrichment for cover letter (recovery of #48) · [PR #50, merged] · DECISION 028
- **2026-05-26** — `/jobs` is staff-only; non-staff get a real 404 · [PR #49, merged] · DECISION 029
- **2026-05-26** — Tavily company research (original — merged into stacked base, did NOT reach master) · [PR #48, recovered as #50]
- **2026-05-26** — Cover letter humanization + copy-paste formatting fix · [PR #47, merged] · DECISION 027
- **2026-05-26** — Migration 013: expand `profiles_plan_check` to include `'staff'` (amends DECISION 021) · [PR #46, merged] · DECISION 026
- **2026-05-26** — Staff-only "Refresh now" button on `/jobs` · [PR #45, merged] · DECISION 025
- **2026-05-26** — Promotion of staff-plan + blog + jobs + resume-per-profile to master · [PR #44, merged]
- **2026-05-26** — One-resume-per-profile (schema migration + account widget + JD-only home flow) · [PR #43, merged via #44] · DECISION 024
- **2026-05-26** — Recent-jobs aggregator at `/jobs` (RemoteOK + Remotive, last 24h, France-friendly) · [PR #42, merged via #44] · DECISION 023
- **2026-05-26** — Blog at `/blog` with 5 MDX seed posts · [PR #41, merged via #44] · DECISION 022
- **2026-05-26** — `'staff'` plan value for comped accounts · [PR #40, merged via #44] · DECISION 021
- **2026-05-26** — `docs/` directory + ARCHITECTURE / DECISIONS / TASKS / summaries · [PR #39, merged]
- **2026-05-18** — Person JSON-LD for founder · [PR #36, merged]
- **2026-05-17** — Explicit AI crawler allowlist in robots.txt · [PR #35, merged]
- **2026-05-17** — Shorter `<title>` (≤60 chars for SERP) · [PR #34, merged]
- **2026-05-17** — Resume PDF page-break tuning (no mid-glyph slicing) · [PR #33, merged]
- **2026-05-17** — Prompt: PRESERVE COMPLETENESS rule (stop summarising) · [PR #32, merged]
- **2026-05-17** — Quota banner refreshes after each generate response · [PR #31, merged]
- **2026-05-16** — Groq model swap → `llama-3.3-70b-versatile` (12K TPM) · [PR #30, merged]
- **2026-05-16** — PDF extraction switched to `pdf-parse` (Vercel-serverless fix) · [PR #29 + #28, merged]
- **2026-05-15** — Drag-and-drop file upload + TPM tightening + 413 auto-retry · [PR #25, merged]
- **2026-05-15** — `<title>` SEO + first-page-blank PDF fix + AEO/GEO surface · [PR #25's predecessor, merged]
- **2026-05-15** — Anonymous resume_uploads + claim-on-signup · [PR #22, merged]
- **2026-05-15** — Signup metadata capture (OS / browser / geo-IP) · [PR #20, merged]
- **2026-05-14** — Checkout no-flicker + TRC-20 + ERC-20 + required support email · [PR #21, merged]
- **2026-05-14** — Multi-tier Pro pricing + support popup + profile prune · [PR #19, merged]
- **2026-05-13** — kairesume rebrand + BEP-20 + free-plan cap + support form + SEO · [PR #16, #17, merged]
- **2026-05-12** — Initial scaffolding, Groq integration, Supabase auth, paywall

---

## Maintenance reminders

- **Quarterly:** review `lib/llm.ts:TPM_BUDGET` against Groq's published free-tier limit. If they bump the limit, we should bump too.
- **When Pro tier prices change:** update `lib/pricing.ts:PRO_TIERS` AND the `Offer` array in `app/layout.tsx:APP_JSONLD`. Both feed downstream copy and structured data.
- **When a new AI crawler emerges:** add to `app/robots.ts`. Today's list is current as of 2026-05-17.
- **On every prompt template change:** run a manual smoke test with the Liam Sato + Jamal Hamilton resumes saved in `/test-fixtures/` (TODO: actually create that directory and pin those PDFs).
- **Before any DB migration:** `006_clamp_free_generations.sql` was tied to the 3-cap era. With the new 10-cap, the rule is still correct (it clamps over-limit values back to the current cap by reading from `SIGNED_IN_FREE_GENERATIONS`). If we ever change the migration to use a literal, that's a regression — keep it driven by app code.
- **Watch Tavily quota:** free tier 1000 q/month. If we approach the cap, either upgrade or gate the enrichment behind Pro/staff plans (see DECISION 028's TPM-consideration note).
- **When promoting a new feature with stacked PRs:** make sure the bottom of the stack's content actually reaches `master`. The classic trap is merging via the stacked base branches — content ends up on the base, not master. Either retarget each PR's base to master before merging, or delete intermediate branches after each merge to trigger GitHub's auto-retarget.
