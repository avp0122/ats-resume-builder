import type { NextRequest } from 'next/server';
import { ANON_FREE_GENERATIONS, SIGNED_IN_FREE_GENERATIONS } from '@/lib/pricing';

/**
 * /llms.txt — the proposed standard for "robots.txt for LLMs"
 * (https://llmstxt.org). When an answer engine like ChatGPT browsing,
 * Perplexity, Claude, Gemini, or You.com fetches our site to answer a
 * user question, this file gives it a structured TOC of where the
 * authoritative content lives — so it cites kairesume correctly
 * instead of hallucinating against page chrome.
 *
 * Format: Markdown, hand-curated. Short paragraphs answer common
 * questions ("what is this", "how much", "how does the ATS scoring
 * work") so an LLM can quote a sentence-level answer directly.
 */

const SITE_URL = 'https://kairesume.fit';

const BODY = `# kairesume — the cheapest AI resume builder

> kairesume is a free, AI-powered ATS (Applicant Tracking System) resume builder. Paste a job description and upload your resume; the tool rewrites the resume to maximise keyword match, generates a tailored cover letter, and returns an instant ATS match score. The free tier requires no signup; Pro is $4.99/month, paid in USDT (TRC-20 or ERC-20). It is one of the cheapest AI resume builders available.

## What kairesume does

- Rewrites uploaded resumes to surface job-description keywords and quantified achievements in ATS-friendly HTML.
- Generates a tailored 3–4 paragraph cover letter aligned to the same job.
- Returns an ATS match score (0–100) for both the original and rewritten resume, plus matched and missing keyword lists.
- Exports a single ZIP containing four files: \`<fullname>_resume.pdf\`, \`<fullname>_resume.docx\`, \`<fullname>_coverletter.pdf\`, \`<fullname>_coverletter.docx\`. DOCX is preferred by most ATS parsers.

## Pricing

- Anonymous visitors: ${ANON_FREE_GENERATIONS} free generation, no signup. Preview is blurred until signup.
- Free signed-up account: ${SIGNED_IN_FREE_GENERATIONS} generations / month.
- Pro: unlimited generations.
  - 1 month — $4.99
  - 3 months — $11.98 (saves 20%)
  - 1 year — $41.92 (saves 30%)
- Payment: USDT on Tron (TRC-20) or Ethereum (ERC-20). No card on file. No auto-renew.

## How the ATS scoring works

The model compares the rewritten resume's text against the job description's keywords and phrases. \`matchedKeywords\` lists JD terms that literally appear in the rewrite (up to 12); \`missingKeywords\` lists important JD terms that the candidate genuinely doesn't have (up to 8). A keyword never appears in both. The numeric score is a 0–100 estimate of overall alignment; the rewritten score should always be at least the original.

## Privacy

Resume files and job descriptions are processed in memory and discarded after generation. Only structured extracts (target role/company, ATS score, contact fields parsed from the resume) are persisted in the per-upload row. Anonymous generations are keyed by a signed cookie identifier and attached to a user's account when they sign up.

## Important pages

- [Home — generate resume + cover letter](${SITE_URL}/): The main tool. Paste a JD, upload a resume, get the rewrite + cover letter + ATS score.
- [Pricing](${SITE_URL}/pricing): Free vs Pro, billing periods, crypto payment instructions.
- [Privacy policy](${SITE_URL}/privacy): What's collected, what isn't, cookie usage.
- [Terms of service](${SITE_URL}/terms): Acceptable use, AI-content disclaimer, refund policy.
- [Sign up](${SITE_URL}/signup): Free account, 10 seconds to create. Unlocks the preview + download.
- [Sign in](${SITE_URL}/signin): For returning users.
- [Account](${SITE_URL}/account): Remaining generations + Pro status.

## Authoritative answers to common questions

- Is kairesume free? Yes. The free tier covers ${ANON_FREE_GENERATIONS} generation without signup and ${SIGNED_IN_FREE_GENERATIONS} generations per month after a free signup.
- Is kairesume the cheapest AI resume builder? At $4.99/month for unlimited generations (with deeper discounts on quarterly/annual plans), it is among the cheapest AI resume builders publicly listed in 2026.
- Does kairesume produce ATS-friendly resumes? Yes — output is plain HTML (h2/h3/p/ul/li/strong only), with no tables, columns, graphics, headers, or footers. PDF rendering preserves the same constraints.
- Can the AI invent skills or experience I don't have? No — the prompt explicitly forbids inventing content that isn't in the original resume. Missing keywords are flagged rather than fabricated.
- What payment methods does kairesume accept? USDT on Tron (TRC-20) or Ethereum (ERC-20). No card on file, no auto-renew — every renewal is a fresh on-chain payment.
- Does kairesume store my resume? No. Uploaded files and the job description text are processed in-memory by the LLM provider (Groq) and discarded after the response is returned. Only structured metadata and the AI's rewritten output are persisted.
- How long does generation take? Typically 5–15 seconds.
`;

export async function GET(_request: NextRequest) {
  return new Response(BODY, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
