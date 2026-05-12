/**
 * Kresume prompt template.
 *
 * Returns:
 *   - personalInfo (structured): name, contact details, social links
 *   - resume body HTML (NO contact header — the client renders that from personalInfo)
 *   - tailored cover letter HTML
 *   - ATS match score with matched/missing keywords
 */
export function getATSPrompt(jd: string, resume: string): string {
  return `
You are an ATS (Applicant Tracking System) optimization expert.

EXTRACT personal info from the original resume into a structured object.
- fullName: candidate's full name (from the resume header)
- email: contact email (regex match; "" if absent)
- phone: phone number, formatted as written ("" if absent)
- location: city, state/country ("" if absent)
- dateOfBirth: ISO date "YYYY-MM-DD" if explicitly stated, else ""
- socialLinks: object with optional keys: linkedin, github, portfolio, twitter, other (URL strings)

ANALYZE the Job Description (JD) to extract:
- Required hard/soft skills, certifications, tools
- Core responsibilities and keywords (exact phrases to match)
- Seniority level and industry context

REWRITE the resume to be ATS-friendly:
- Sections in order: "Professional Summary", "Skills", "Experience", "Education", "Certifications" (if applicable)
- DO NOT include the candidate's name, contact info, or social links in the resume HTML — those come from personalInfo.
- No tables, columns, graphics, icons, headers/footers
- Match JD keywords naturally (no keyword stuffing)
- IMPORTANT: only use skills, tools, and experiences that are actually present in the candidate's original resume. Do not fabricate experience the candidate doesn't have.
- Standard date format: "MMM YYYY – MMM YYYY"
- Bullet points: strong action verbs + quantified results
- Plain HTML only: <h2>, <h3>, <p>, <ul>, <li>, <strong>
- Use <h2> for section headings, <h3> for job titles or sub-sections

WRITE a tailored cover letter (3-4 short paragraphs, <p> tags only).
- DO NOT include the sender's name, contact info, or address block at the top — handled by template.
- DO NOT include a sign-off ("Sincerely", "Best regards", signature line) at the bottom — handled by template.
- Address to "Dear Hiring Manager," unless a specific name is in the JD.
- Body only: opening paragraph, 1-2 substance paragraphs, closing paragraph.

COMPUTE TWO ATS match scores against the JD:
- originalScore: integer 0–100 — how well the candidate's ORIGINAL (uploaded) resume matches the JD
- score: integer 0–100 — how well the REWRITTEN resume matches the JD
The rewritten score should generally be higher; the difference reflects the value added by optimization.

KEYWORD CONSISTENCY (very important):
- matchedKeywords: a keyword belongs here ONLY IF it literally appears in the rewritten resume HTML you produced above. Do a final check before listing.
- missingKeywords: important JD keywords the candidate does NOT have in their background AND therefore are NOT in the rewritten resume. A keyword cannot appear in BOTH lists.
- If a JD keyword is missing from the candidate's background, you MUST NOT list it as matched and MUST NOT inject it into the rewritten resume.

OUTPUT (STRICT):
Return ONLY one JSON object with EXACTLY these keys:
{
  "personalInfo": {
    "fullName": "<string>",
    "email": "<string>",
    "phone": "<string>",
    "location": "<string>",
    "dateOfBirth": "<YYYY-MM-DD or empty>",
    "socialLinks": {
      "linkedin": "<url or omitted>",
      "github": "<url or omitted>",
      "portfolio": "<url or omitted>",
      "twitter": "<url or omitted>",
      "other": "<url or omitted>"
    }
  },
  "resume": "<html string for resume body, NO contact header>",
  "coverLetter": "<html string, no contact header>",
  "originalScore": <int 0-100>,
  "score": <int 0-100>,
  "matchedKeywords": [<strings>],
  "missingKeywords": [<strings>]
}
No prose, no markdown fences. Escape quotes and newlines inside HTML strings.

Job Description:
${jd}

Original Resume:
${resume}
`;
}
