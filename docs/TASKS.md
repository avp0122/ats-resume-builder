# Tasks

> Active work state. Newest at the top in each section. Move tasks between sections as state changes. Reference PR numbers + commit hashes for traceability.

Last updated: 2026-05-26.

---

## In progress

*Nothing currently being actively worked on. The two most recent feature PRs are still open and waiting on review/merge.*

---

## Next up

- **Multi-template picker for the rendered output.** Three variants (Modern / Classic / Compact), all ATS-clean, user picks via a dropdown on the result page. Suggested as an alternative to in-place PDF replacement (declined in DECISION 020). Effort: 1 PR. Files: new `lib/resumeTemplate.ts` variants + a picker in `app/page.tsx`.
- **Disable Cloudflare's `Content-Signal: search=yes, ai-train=no` injection.** Contradicts our explicit AI allowlist in `robots.txt` (PR #35). Cloudflare dashboard → Security → Bots → AI Audit / Content Signals → toggle off. **Manual config change** — no code, but blocking on user dashboard access.
- **Submit `/sitemap.xml` to Google Search Console + Bing Webmaster Tools.** Earlier "Couldn't fetch" likely a stale-status artefact (curl confirms Googlebot can reach it). Remove + re-add in Search Console to force a retry.
- **Update Supabase dashboard "Site URL" setting** to `https://kairesume.fit`. Code-level `emailRedirectTo` is set, but Supabase builds the verify link from the dashboard Site URL setting. Without this, confirmation emails still link to localhost.

---

## Blocked

- *None.*

---

## Open (review pending)

| PR | Title | Branch | Status |
|---|---|---|---|
| #38 | DOCX output alongside PDF | `claude/docx-output` | open |
| #37 | Bump free tier 3 → 10 | `claude/bump-free-tier-to-10` | open |

(Refresh from `gh pr list --state open` for current state — list may be stale.)

---

## Recently completed

Newest first. Strikethrough what's no longer relevant.

- **2026-05-26** — Staff-only "Refresh now" button on `/jobs` (cache invalidation) · PR pending
- **2026-05-26** — Promotion of staff-plan + blog + jobs + resume-per-profile to master · [PR #44, merged]
- **2026-05-26** — One-resume-per-profile (schema migration + account widget + JD-only home flow) · [PR #43, merged via #44]
- **2026-05-26** — Recent-jobs aggregator at `/jobs` (RemoteOK + Remotive, last 24h, France-friendly) · [PR #42, merged via #44]
- **2026-05-26** — Blog at `/blog` with 5 MDX seed posts · [PR #41, merged via #44]
- **2026-05-26** — `'staff'` plan value for comped accounts · [PR #40, merged via #44]
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
