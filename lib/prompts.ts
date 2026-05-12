/**
 * Kresume prompt template — returns ATS-optimized resume, cover letter, and an ATS score.
 */

export function getATSPrompt(jd: string, resume: string): string {
  return `
You are an ATS (Applicant Tracking System) optimization expert.

ANALYZE the Job Description (JD) to extract:
- Required hard/soft skills, certifications, tools
- Core responsibilities and keywords (exact phrases to match)
- Seniority level and industry context

REWRITE the resume to be ATS-friendly:
- Sections in order: "Professional Summary", "Skills", "Experience", "Education", "Certifications" (if applicable)
- No tables, columns, graphics, icons, headers/footers
- Match JD keywords naturally (no keyword stuffing)
- Standard date format: "MMM YYYY – MMM YYYY"
- Bullet points: strong action verbs + quantified results
- Plain HTML only: <h1>, <h2>, <h3>, <p>, <ul>, <li>

WRITE a tailored cover letter (3-4 short paragraphs, <p> tags only).

COMPUTE the ATS match score:
- score: integer 0–100 reflecting how well the rewritten resume matches the JD
- matchedKeywords: up to 12 JD keywords/phrases the rewritten resume covers
- missingKeywords: up to 8 JD keywords the candidate lacks based on the original resume

OUTPUT (STRICT):
Return ONLY a single JSON object with EXACTLY these keys:
{
  "resume": "<html string>",
  "coverLetter": "<html string>",
  "score": <int 0-100>,
  "matchedKeywords": [<strings>],
  "missingKeywords": [<strings>]
}
No prose, no markdown fences. Escape quotes and newlines inside the HTML strings.

Job Description:
${jd}

Original Resume:
${resume}
`;
}
