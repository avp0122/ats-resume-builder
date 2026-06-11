# kairesume FAQ

This file is the canonical FAQ corpus for the chat assistant. Each `##` heading is one FAQ entry — keep them self-contained because the chunker treats them as independent retrieval units. Aim for one question per heading and 2-4 paragraphs of answer.

> **Editing this file:** every change re-deploys and triggers the n8n reindex workflow (Vercel deploy hook → n8n schedule). New entries appear in the chat within a minute or two.

---

## What is kairesume?

kairesume is an AI-powered resume + cover letter builder. You paste a job description, upload your current resume (PDF or DOCX), and it rewrites the resume to match the role's language, generates a tailored cover letter, and gives you a 0–100 ATS match score with the matched + missing keywords called out.

The goal is to clear the Applicant Tracking System (ATS) — the software that filters out about three quarters of resumes before any human sees them. We don't help you exaggerate; we help you describe your real experience in the words a recruiter's keyword filter is looking for.

## How does it work?

You give us two things: a job description (paste the text) and your resume (upload PDF or DOCX up to 10 MB). The site runs both through Groq Llama 3.3 70B with prompts that have been tuned for ATS-friendly output. About 10 seconds later you see the rewritten resume, the cover letter, and the match score side-by-side.

Files are processed in-memory and discarded after generation. For signed-in users we optionally save the extracted resume text on your profile so you only have to upload once.

## How many free generations do I get?

Anonymous visitors (no signup) get 1 free generation per browser. Signed-in free accounts get 10 generations per month. Pro and Staff plans are unlimited. There's no credit card required at any of these tiers — the anonymous and free signed-in plans are genuinely free.

The 10-per-month free signed-in cap resets at the start of each calendar month.

## What file formats can I upload?

PDF and DOCX, up to 10 MB. Older `.doc` (Word 97) is not supported — re-save as DOCX first. Image-only scanned PDFs (no embedded text layer) also don't extract well; if your resume is a scan, run it through OCR first.

If a generation fails immediately after upload, the file is probably DRM-protected, corrupted, or password-protected. Try opening it in your normal editor — if that asks for a password, that's the issue.

## What is an ATS?

An Applicant Tracking System (ATS) is the software employers use to receive, store, and filter resumes. Common ones: Workday, Greenhouse, Lever, iCIMS, Taleo. When you upload your resume to a job application, it's the ATS that parses the file and turns it into structured data the recruiter searches against.

The filter step is where most resumes die. Recruiters search for specific keywords ("Kubernetes", "Series B", "5+ years") and the ATS surfaces matching resumes first. kairesume rewrites your real experience using the keywords that match the target job description, so your resume ranks higher in those searches without misrepresenting what you've done.

## What's the difference between Free and Pro?

Free (signed in) gets 10 generations per month and the same quality of output as Pro. Pro gets unlimited generations and is best if you're actively applying to multiple roles per week.

Both plans get the same AI model (Groq Llama 3.3 70B), the same ATS scoring, the same downloads (resume.pdf + resume.docx + coverletter.pdf + coverletter.docx in one ZIP), and the same support. The only difference is the generation cap.

## How much is Pro?

Pro starts at $4.99 per month. Multi-month plans give a discount: 3 months prepaid is 20% off, 1 year prepaid is 30% off. The exact prices for each tier are on the [pricing page](/pricing).

There's no auto-renewal trick — when your prepaid period ends you go back to the free tier automatically. We don't store your payment details.

## How do I pay for Pro?

Payment is in USDT (a USD-pegged stablecoin) on the Tron network (TRC-20) or Ethereum network (ERC-20). Choose the network on the checkout page, send the exact amount to the displayed wallet address, and the system auto-verifies on-chain. Pro activates within a few minutes of the transaction confirming.

We chose crypto for two reasons: no card processor takes a 3% cut, and there's no chargeback risk that forces us to keep your card details on file.

## Do you accept credit cards?

Not currently — payment is USDT (TRC-20 or ERC-20) only. We're considering Stripe for the next iteration if there's enough demand. If you want this, email the support form linked at the bottom of the chat — that signal helps us prioritize.

## What if I want a refund?

Email support via the [support form](#) (or the "Talk to a human" link in this chat) with your transaction hash and reason. We refund unused subscriptions on a case-by-case basis. If the product didn't work for your use case in your first 7 days of Pro, we'll refund in full without questions.

We can't reverse on-chain transactions automatically — every refund is a manual send-back, which is why we ask for the transaction hash.

## Where does my data go after generation?

The job description and the uploaded resume file are processed in-memory and discarded as soon as the generation finishes. They're not written to any database, log, or storage bucket.

For signed-in users who opt in, the **extracted text** of the resume is saved on your profile so you can run subsequent generations without re-uploading. You can clear that text at any time from the Account page. The original file binary is never saved.

## Do you store my resume?

Only if you're signed in AND you've uploaded a resume to your profile (the one-resume-per-profile flow). In that case, we store the extracted text, the original filename, and the upload timestamp. We do **not** store the original PDF/DOCX file.

Anonymous and signed-in users who upload per-generation: nothing is stored.

You can delete the stored resume text any time from the Account page.

## How do I delete my data?

For your stored resume: go to the Account page and click "Remove stored resume". This wipes `resume_text`, `resume_filename`, and `resume_uploaded_at` from your profile row.

For your account itself: email support via the "Talk to a human" link. Account deletion removes your profile row, your auth user, and any associated metadata. Pro users mid-subscription will be refunded pro-rata to a wallet address you specify.

## Is my data secure?

Auth and database are on Supabase with Row-Level Security on all user-scoped tables. Transit is HTTPS-only (HSTS preloaded). The Groq API call sends only your resume text + the job description — no PII beyond what's already on your resume.

We don't ship your data to any analytics service, advertising network, or AI training pipeline. The blog post ["What ATS actually does to your resume"](/blog/how-ats-parsers-read-your-resume-2026) goes into more detail.

## Why did my generation fail with a "TPM" error?

TPM stands for "tokens per minute" — the rate limit our LLM provider (Groq) enforces. The free tier is 12,000 TPM. If your job description is unusually long (over ~2,500 tokens, roughly 1,800 words), the generation can hit the cap.

The site will normally truncate gracefully. If you're seeing TPM errors repeatedly, paste a shorter version of the JD — just the responsibilities + qualifications sections, not the boilerplate "we're a great place to work" preamble.

## Can I use my generated resume for any job application?

Yes. The generated resume is your text, optimized — it belongs to you. Use it on Workday, LinkedIn Easy Apply, the company's own portal, anywhere. The DOCX format is preferred by most ATS parsers; the PDF is what humans usually see.

There's no watermark, attribution, or "Made with kairesume" tag. The output is yours.

## How do I get more free generations?

Right now the free tiers are fixed: 1 lifetime for anonymous, 10/month for signed-in free. We don't offer referral credits yet — though if there's interest, we're considering it.

If you've genuinely hit the cap on a job hunt and don't want to subscribe yet, email support with a quick note about your situation. We're not strict about it.

## Can I customize the cover letter?

The cover letter is generated from your resume + the JD + recent online research about the company (via Tavily). Customization isn't a UI feature yet — but you can: (a) regenerate to get a different angle, (b) edit the generated text in the result page before downloading, or (c) download as DOCX and edit in Word/Google Docs.

The prompt is tuned to avoid stale openings ("I am excited to apply…") and to follow a Hook → Proof → Bridge → Close structure under 280 words.

## Why does my cover letter mention recent news about the company?

When a company name is detected in the job description, the cover letter generator pulls a few recent web search results about the company (mission, latest funding round, product launches, etc.) and grounds paragraph 1 in those — so the letter actually shows you know what the company does today, not what their About page said in 2019.

If we couldn't find anything (small company, no recent coverage), or our research budget for the month is exhausted, the cover letter falls back to a JD-only humanized version.

## How do I contact human support?

Click "Talk to a human" inside this chat — it opens the support form. You can also email directly via the support form in the footer. Response time is usually within a business day; for refund or payment issues we prioritize within a few hours.

The chat assistant can answer most non-urgent questions (pricing, file formats, generation tips, ATS basics). For account-specific issues, refund requests, or anything involving your transaction hash, please use the human form.

## Should I use a single resume for every application?

No — that's the trap kairesume exists to fix. Generic resumes get filtered out by the ATS because the keyword density doesn't match any specific role. Even small re-targeting per application (matching the JD's vocabulary, surfacing the right 3-5 keywords) materially improves ATS rank.

You don't have to rewrite from scratch each time — that's why we built the tool. Paste the JD, click Generate, download. 30 seconds per application.

## What's the right resume length?

One page for under 10 years of experience, two pages for 10+ years. Three pages is almost always too long unless you're applying for a federal job (different rules apply there). ATS parsers handle multi-page resumes fine — the page-break question is for the human reader who reviews the resumes the ATS ranked highest.

kairesume's page-break tuning is targeted at avoiding mid-glyph cuts and orphan headings, not at forcing a specific page count.

## Should I include a photo on my resume?

No — at least not for the United States, Canada, UK, Australia, or anywhere covered by anti-discrimination hiring laws. ATS parsers don't read photos, and the parser often *fails entirely* on a photo-heavy template (which is why Canva resumes get rejected at the ATS step). In countries where a photo is culturally expected (parts of Europe, Asia), use a simple headshot and keep the rest of the layout ATS-clean.

The blog post ["Canva-style resumes get rejected"](/blog/canva-cake-resumes-ats-rejected) covers the underlying ATS-parser failure modes.

## Is a Canva resume ATS-friendly?

Mostly no. Canva templates rely on multi-column layouts, custom fonts, embedded icons, and graphics-heavy headers — all of which trip up ATS parsers. The parser typically reads the columns left-to-right, top-to-bottom, mashing your sections together; or it skips entire sections that are inside graphic boxes.

The fix is a single-column, no-graphics, standard-font (Arial / Calibri / Times) layout — which is exactly what kairesume's PDF + DOCX renderer produces.

## What kind of jobs work best with this?

Any white-collar role where the application goes through an ATS — engineering, product, design, ops, finance, marketing, sales, healthcare. The keyword-density model applies almost universally.

We're less useful for: roles where the application is "send your portfolio" (graphic design, creative writing), federal/government roles (different format requirements), or very senior executive roles where the resume is a formality and the network does the work.
