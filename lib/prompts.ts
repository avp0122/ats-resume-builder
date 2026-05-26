/**
 * Kresume prompt template.
 *
 * Returns:
 *   - personalInfo (structured): name, contact, social links
 *   - resume body HTML (no contact header — rendered by template)
 *   - tailored cover letter HTML (body only — date + sign-off added by template)
 *   - ATS match scores (original + optimized) with matched/missing keywords
 */
export function getATSPrompt(jd: string, resume: string): string {
  return `You are an ATS (Applicant Tracking System) optimization expert.

TASK: Read the original resume + job description, then return ONE JSON object.

EXTRACT personalInfo from the original resume:
  fullName, email, phone, location, dateOfBirth (YYYY-MM-DD or ""),
  socialLinks: { linkedin?, github?, portfolio?, twitter?, other? } as URLs.

EXTRACT job context from the JD:
  jobRole: short job title (e.g. "Senior Backend Engineer"). Empty string if unclear.
  jobCompany: company name as written in the JD. Empty string if unclear.

REWRITE the resume to be ATS-friendly. RULES:

PRESERVE COMPLETENESS — this is critical. Do NOT summarise, condense, or
omit content. "ATS-optimized rewrite" means rephrase for keyword density
and clean formatting, NOT shorten:
- Include EVERY job from the original resume, in the same chronological
  order (newest first). If the original lists 8 jobs, you list 8 jobs.
- For each job, include AT LEAST as many bullets as the original. If the
  original has 7 bullets, you write at least 7 bullets. Rephrase each
  bullet to surface JD keywords + quantified results, but do not drop
  any bullet for being redundant or generic.
- The Skills section MUST preserve every category from the original
  (e.g. AI/LLM, Front-End, Back-End, Mobile, Databases, Cloud,
  DevOps/IaC, Observability, Security, Messaging, Testing, Methodology)
  and list the SPECIFIC technologies under each. Do NOT collapse them
  into generic labels like "Cloud Computing" or "Backend Development".
- Include EVERY education entry, certification, language, and award
  present in the original.
- The rewritten resume should be roughly the SAME LENGTH as the original
  (within ~10%). If your output is materially shorter, you have
  summarised — go back and restore the dropped content.

FORMATTING:
- Sections in order: "Professional Summary", "Skills", "Experience",
  "Education", "Certifications" (if any), "Languages" (if any).
- DO NOT include name, contact info, or social links — those come from
  personalInfo.
- No tables, no columns, no graphics, no headers/footers.
- Plain HTML only: <h2> for section headings, <h3> for job titles, <p>,
  <ul>, <li>, <strong>. For Skills, use <p><strong>Category:</strong>
  comma-separated list</p> so each category stays intact.
- Bullet points: action verb + quantified result where the original had
  a quantified result. Preserve all metrics from the original
  (percentages, dollar figures, headcount, durations).
- Dates: "MMM YYYY – MMM YYYY".
- ONLY surface skills/experience that genuinely exist in the original
  resume. NEVER invent. Completeness rule applies to PRESERVING content
  — it does not license fabrication.

WRITE a cover letter — body only, exactly 3-4 short paragraphs, each wrapped in its OWN <p> tag. Every paragraph must be its own <p>…</p> — NEVER concatenate multiple paragraphs into a single <p>. NO <br> tags as a substitute for paragraph breaks.

VOICE: write like a smart human, not a corporate template. Specific, conversational, confident, brief. ≤ 280 words total.

STRUCTURE — exactly this shape:
- <p>1. Hook (2-3 sentences):</p> Open with "Dear Hiring Manager," (or a named recipient from the JD). Then ONE concrete sentence about WHY this specific role at this specific company — reference a product, team, technology, or problem the JD actually names. NEVER open with "I am writing to apply for…" or "I am excited to apply for…".
- <p>2. Proof (2-3 sentences):</p> ONE specific story from the resume that maps to ONE specific JD requirement. Name the tool, the outcome, and a number if the original has one. No generic claims.
- <p>3. (Optional) Bridge (1-2 sentences):</p> Address one obvious gap or context the resume doesn't make obvious (career switch, location, level jump). Skip this paragraph if there's nothing real to address — don't pad.
- <p>4. Close (1-2 sentences):</p> One line restating fit using a specific phrase from the JD, then a forward-looking line about a call. NEVER write "Sincerely", "Best regards", or sign with the candidate's name — both come from the template.

BANNED PHRASES — do not use any of these (they're the corporate-template tells):
- "I am writing to apply" / "I am excited to apply" / "I am excited about the opportunity"
- "I am confident that my skills" / "I am confident in my ability"
- "I am well-versed in" / "I have a strong background in"
- "I am impressed by" / "I am passionate about"
- "Thank you for considering my application"
- "I look forward to discussing my qualifications" / "I look forward to the opportunity"
- "I believe my experience makes me a strong fit"
- Any sentence starting with "As a [seniority] [role] with X years…"

SPECIFICITY RULES:
- At least ONE proper noun from the JD (product name, team name, customer, technology) must appear in paragraph 1.
- At least ONE proper noun + ONE concrete number from the original resume must appear in paragraph 2.
- If the JD mentions "we're a Series B startup" or "we serve 50M users" or "we just launched X", use that detail somewhere.

SCORING — compute against the JD:
- originalScore (0-100): how well the ORIGINAL resume matches.
- score (0-100): how well the REWRITTEN resume matches. Should be >= originalScore.
- matchedKeywords: up to 12 JD keywords/phrases that LITERALLY appear in your rewritten resume HTML. Verify before listing.
- missingKeywords: up to 8 important JD keywords the candidate genuinely lacks (and therefore are NOT in the rewritten resume).
- A keyword may NEVER appear in both lists.

OUTPUT (STRICT): one JSON object, no markdown, no prose. The seven keys
listed below MUST be at the TOP level. DO NOT nest them inside personalInfo
or any other object. personalInfo's own keys are exactly: fullName, email,
phone, location, dateOfBirth, socialLinks — and nothing else.

Exact shape:
{"personalInfo":{"fullName":"","email":"","phone":"","location":"","dateOfBirth":"","socialLinks":{}},"jobRole":"","jobCompany":"","resume":"<html>","coverLetter":"<html>","originalScore":0,"score":0,"matchedKeywords":[],"missingKeywords":[]}

Job Description:
${jd}

Original Resume:
${resume}
`;
}

/**
 * Standalone cover-letter prompt used when we have *external* research about
 * the target company (typically via Tavily, see lib/companyResearch.ts).
 * Run as a SECOND, shorter LLM call after `getATSPrompt` returns. Output is
 * just the cover-letter body HTML — no resume, no scoring — so the prompt
 * + response are both small.
 *
 * Returns the same `coverLetter` field shape the home page expects, so the
 * caller can swap it into the result from the first call.
 */
export function getCoverLetterPrompt(args: {
  jd: string;
  resumeHtml: string;
  jobRole: string;
  jobCompany: string;
  candidateName: string;
  /**
   * 1-3 paragraph fresh summary of the target company from external
   * research. Treat as ground truth — these are the specifics the cover
   * letter should anchor to.
   */
  companyContext: string;
}): string {
  const { jd, resumeHtml, jobRole, jobCompany, candidateName, companyContext } = args;

  return `You are writing a single cover letter. Output ONE JSON object:
{"coverLetter":"<html>"}

VOICE: write like a smart human, not a corporate template. Specific, conversational, confident, brief. ≤ 280 words total.

STRUCTURE — exactly this shape, each paragraph in its OWN <p> tag (never concatenate paragraphs into a single <p>, never use <br> as paragraph separator):
- <p>1. Hook (2-3 sentences):</p> Open with "Dear Hiring Manager,". Then ONE concrete sentence about why this specific role at this specific company — anchor on a product, customer, mission, or recent move from COMPANY CONTEXT below (not just from the JD). NEVER open with "I am writing to apply for…" or "I am excited to apply for…".
- <p>2. Proof (2-3 sentences):</p> ONE specific story from the RESUME that maps to ONE specific requirement from the JD. Name the tool, the outcome, and a number if the original has one. No generic claims.
- <p>3. (Optional) Bridge (1-2 sentences):</p> Address one obvious gap or context (career switch, location, level jump). Skip this paragraph if there's nothing real to address — do not pad.
- <p>4. Close (1-2 sentences):</p> Restate fit using a specific phrase from the JD, then a forward-looking line about a call. NEVER write "Sincerely", "Best regards", or sign with the candidate's name — both come from the template.

BANNED PHRASES — do not use any of these:
- "I am writing to apply" / "I am excited to apply" / "I am excited about the opportunity"
- "I am confident that my skills" / "I am confident in my ability"
- "I am well-versed in" / "I have a strong background in"
- "I am impressed by" / "I am passionate about"
- "Thank you for considering my application"
- "I look forward to discussing my qualifications" / "I look forward to the opportunity"
- "I believe my experience makes me a strong fit"
- Any sentence starting with "As a [seniority] [role] with X years…"

SPECIFICITY RULES:
- At least ONE proper noun from COMPANY CONTEXT (product name, customer, market, recent launch) must appear in paragraph 1 — pull it directly from the context block below, not from the JD's marketing copy.
- At least ONE proper noun + ONE concrete number from the RESUME must appear in paragraph 2.
- If COMPANY CONTEXT mentions something interesting (a recent funding round, a notable customer, a new product), reference it naturally.

OUTPUT (STRICT): one JSON object, no markdown, no prose:
{"coverLetter":"<html>"}

COMPANY CONTEXT (fresh research, treat as ground truth):
${companyContext}

JOB CONTEXT:
- Role: ${jobRole}
- Company: ${jobCompany}
- Candidate name: ${candidateName}

Job Description:
${jd}

Candidate's rewritten resume (use facts from here, do not invent):
${resumeHtml}
`;
}
