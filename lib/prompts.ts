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
- Sections in order: "Professional Summary", "Skills", "Experience", "Education", "Certifications" (if any).
- DO NOT include name, contact info, or social links — those come from personalInfo.
- No tables, no columns, no graphics, no headers/footers.
- Plain HTML only: <h2> for section headings, <h3> for job titles, <p>, <ul>, <li>, <strong>.
- Bullet points: action verb + quantified result.
- Dates: "MMM YYYY – MMM YYYY".
- ONLY surface skills/experience that genuinely exist in the original resume. NEVER invent.

WRITE a cover letter — body only, 3-4 short paragraphs in <p> tags.
- Open with "Dear Hiring Manager," (or named recipient if the JD provides one).
- Body paragraphs ONLY. NO sender block at top. NO sign-off ("Sincerely", signature) — added by template.

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
