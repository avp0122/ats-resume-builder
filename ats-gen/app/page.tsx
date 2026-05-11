'use client';

import React, { useState, useCallback } from 'react';
import html2pdf from 'html2pdf.js';
import ResumePreview from '@/components/ResumePreview';
import LoadingSpinner from '@/components/LoadingSpinner';

interface GenerationResult {
  resume: string;
  coverLetter: string;
}

interface FormState {
  jd: string;
  resume: string;
}

// Sample data for demo purposes
const SAMPLE_JD = `Software Engineer - Full Stack

We are seeking a talented Full Stack Software Engineer to join our growing team. 

Responsibilities:
- Design and develop scalable web applications using React, Node.js, and TypeScript
- Collaborate with cross-functional teams to define and ship new features
- Write clean, maintainable, and well-tested code
- Participate in code reviews and mentor junior developers
- Optimize applications for maximum speed and scalability

Requirements:
- Bachelor's degree in Computer Science or related field
- 3+ years of experience in full-stack development
- Strong proficiency in JavaScript/TypeScript, React, and Node.js
- Experience with SQL and NoSQL databases
- Familiarity with cloud platforms (AWS, GCP, or Azure)
- Excellent problem-solving and communication skills`;

const SAMPLE_RESUME = `John Doe
john.doe@email.com | (555) 123-4567 | San Francisco, CA

EXPERIENCE

Software Developer | Tech Corp | 2021 - Present
- Built web applications using JavaScript and React
- Worked with databases and APIs
- Collaborated with team members on projects

Junior Developer | StartupXYZ | 2020 - 2021
- Developed features for company website
- Fixed bugs and improved performance
- Participated in agile development process

EDUCATION

Bachelor of Science in Computer Science
State University | 2020

SKILLS

JavaScript, React, Node.js, HTML, CSS, Git`;

export default function Home() {
  const [formState, setFormState] = useState<FormState>({
    jd: '',
    resume: '',
  });
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInputChange = (field: keyof FormState, value: string) => {
    setFormState(prev => ({ ...prev, [field]: value }));
    setError(null);
  };

  const loadSampleData = () => {
    setFormState({
      jd: SAMPLE_JD,
      resume: SAMPLE_RESUME,
    });
    setError(null);
  };

  const downloadPDF = useCallback((htmlContent: string, filename: string) => {
    const element = document.createElement('div');
    element.innerHTML = htmlContent;
    
    // Style the element for PDF generation
    element.style.padding = '20px';
    element.style.fontFamily = 'Arial, sans-serif';
    element.style.fontSize = '12px';
    element.style.lineHeight = '1.6';
    
    const opt = {
      margin: 0.5,
      filename: filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
    };

    html2pdf().set(opt).from(element).save();
  }, []);

  const copyToClipboard = useCallback((html: string) => {
    navigator.clipboard.writeText(html).catch(err => {
      console.error('Failed to copy:', err);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formState.jd.trim() || !formState.resume.trim()) {
      setError('Please fill in both fields');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jd: formState.jd,
          resume: formState.resume,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate content');
      }

      setResult({
        resume: data.resume,
        coverLetter: data.coverLetter,
      });
    } catch (err) {
      console.error('Generation error:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Header */}
      <header className="mb-8 text-center">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
          ATS Resume & Cover Letter Generator
        </h1>
        <p className="text-gray-600 max-w-2xl mx-auto">
          Paste a job description and your resume to generate an ATS-optimized resume 
          and tailored cover letter powered by AI.
        </p>
      </header>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-md p-6 mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800">Input</h2>
          <button
            type="button"
            onClick={loadSampleData}
            className="text-sm text-blue-600 hover:text-blue-800 underline"
          >
            Load Sample Data
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Job Description Input */}
          <div>
            <label htmlFor="jd" className="block text-sm font-medium text-gray-700 mb-2">
              Paste Job Description *
            </label>
            <textarea
              id="jd"
              value={formState.jd}
              onChange={(e) => handleInputChange('jd', e.target.value)}
              placeholder="Paste the full job description here..."
              rows={12}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none text-sm"
              required
            />
          </div>

          {/* Resume Input */}
          <div>
            <label htmlFor="resume" className="block text-sm font-medium text-gray-700 mb-2">
              Paste Your Resume *
            </label>
            <textarea
              id="resume"
              value={formState.resume}
              onChange={(e) => handleInputChange('resume', e.target.value)}
              placeholder="Paste your current resume text here..."
              rows={12}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none text-sm"
              required
            />
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">
            ⚠️ {error}
          </div>
        )}

        {/* Submit Button */}
        <div className="mt-6">
          <button
            type="submit"
            disabled={isLoading}
            className="w-full md:w-auto px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors flex items-center justify-center mx-auto md:mx-0"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Generating...
              </>
            ) : (
              '✨ Generate ATS Resume & Cover Letter'
            )}
          </button>
        </div>
      </form>

      {/* Loading State */}
      {isLoading && <LoadingSpinner />}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-gray-900">Results</h2>
          
          <ResumePreview
            htmlContent={result.resume}
            title="ATS-Optimized Resume"
            onDownload={downloadPDF}
            onCopy={copyToClipboard}
          />
          
          <ResumePreview
            htmlContent={result.coverLetter}
            title="Tailored Cover Letter"
            onDownload={downloadPDF}
            onCopy={copyToClipboard}
          />
        </div>
      )}

      {/* Footer */}
      <footer className="mt-12 text-center text-sm text-gray-500">
        <p>Powered by Groq AI • Free ATS optimization tool</p>
      </footer>
    </main>
  );
}
