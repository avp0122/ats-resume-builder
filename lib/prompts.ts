/**
 * ATS Resume & Cover Letter Generator - Prompt Templates
 * 
 * Contains the exact prompt template for ATS optimization.
 */

/**
 * Generate the ATS optimization prompt
 * 
 * @param jd - Job description text
 * @param resume - Original resume text
 * @returns Formatted prompt string for LLM
 */
export function getATSPrompt(jd: string, resume: string): string {
  return `
You are an ATS (Applicant Tracking System) optimization expert. Your task:

1. ANALYZE the Job Description (JD) to extract:
   - Required hard/soft skills, certifications, tools
   - Core responsibilities and keywords (exact phrases to match)
   - Seniority level and industry context

2. REWRITE the resume to be ATS-friendly:
   - Use ONLY these section headings in order: "Professional Summary", "Skills", "Experience", "Education", "Certifications" (if applicable)
   - Remove tables, columns, graphics, icons, headers/footers
   - Match JD keywords naturally (no keyword stuffing)
   - Use standard date format: "MMM YYYY – MMM YYYY"
   - Start bullet points with strong action verbs + quantify results
   - Keep formatting: plain HTML with <h1>, <h2>, <h3>, <p>, <ul>, <li> ONLY

3. WRITE a tailored cover letter:
   - 3-4 concise paragraphs
   - Align candidate's background with JD requirements
   - Show enthusiasm + specific value-add
   - Plain HTML with <p> tags only

4. OUTPUT FORMAT (STRICT):
   - Return ONLY valid JSON with exactly two keys: "resume" and "coverLetter"
   - Values must be clean HTML strings (no markdown, no code fences)
   - Properly escape all quotes, newlines, and special characters in the HTML strings
   - Ensure the JSON is complete and properly closed
   - Example format: {"resume": "<h1>Professional Summary</h1><p>Summary text...</p>", "coverLetter": "<p>Dear Hiring Manager...</p>"}
   - NO additional text, explanations, or formatting outside the JSON object

Job Description:
${jd}

Original Resume:
${resume}
`;
}
