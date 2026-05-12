'use client';

import React, { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import ResumePreview from '@/components/ResumePreview';
import LoadingSpinner from '@/components/LoadingSpinner';
import ATSScore from '@/components/ATSScore';
import type { PersonalInfo } from '@/lib/llm';
import { renderCoverLetterDocument, renderResumeDocument } from '@/lib/resumeTemplate';

interface GenerationResult {
  personalInfo: PersonalInfo;
  resume: string;
  coverLetter: string;
  originalScore: number;
  score: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  usage: {
    count: number;
    freeLimit: number;
    downloadAllowed: boolean;
    needsSignin: boolean;
    plan: 'free' | 'pro';
  };
}

interface FormState {
  jd: string;
  resume: File | null;
}

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

type Tab = 'resume' | 'cover';

export default function Home() {
  const [formState, setFormState] = useState<FormState>({ jd: '', resume: null });
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('resume');
  const [showSigninModal, setShowSigninModal] = useState(false);

  const handleInputChange = (field: keyof FormState, value: string | File | null) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
    setError(null);
  };

  const loadSampleJD = () => {
    setFormState((prev) => ({ ...prev, jd: SAMPLE_JD }));
    setError(null);
  };

  const clearForm = () => {
    setFormState({ jd: '', resume: null });
    setResult(null);
    setError(null);
    const fileInput = document.getElementById('resume') as HTMLInputElement | null;
    if (fileInput) fileInput.value = '';
  };

  const downloadPDF = useCallback(async (htmlContent: string, filename: string) => {
    // The htmlContent passed in is already a fully styled document
    // (rendered via renderResumeDocument / renderCoverLetterDocument).
    // Mount it visibly off-screen with an explicit width so html2canvas can
    // measure and snapshot the layout — invisible/zero-width parents render
    // blank PDFs.
    const wrapper = document.createElement('div');
    wrapper.style.position = 'absolute';
    wrapper.style.top = '0';
    wrapper.style.left = '0';
    wrapper.style.width = '816px'; // 8.5in * 96dpi
    wrapper.style.background = '#ffffff';
    wrapper.style.zIndex = '-1';
    wrapper.style.opacity = '0';
    wrapper.style.pointerEvents = 'none';
    wrapper.innerHTML = htmlContent;
    document.body.appendChild(wrapper);

    // Yield to the browser so layout/fonts settle before snapshot.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const opt = {
      margin: [10, 0, 10, 0] as [number, number, number, number],
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        windowWidth: 816,
      },
      jsPDF: { unit: 'pt', format: 'letter', orientation: 'portrait' as const },
      pagebreak: { mode: ['css', 'legacy'] as any },
    };

    const { default: html2pdf } = await import('html2pdf.js');
    try {
      await html2pdf().set(opt).from(wrapper.firstElementChild || wrapper).save();
    } finally {
      wrapper.remove();
    }
  }, []);

  const copyToClipboard = useCallback((html: string) => {
    navigator.clipboard.writeText(html).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.jd.trim() || !formState.resume) {
      setError('Please paste a job description and upload your resume.');
      return;
    }
    setIsLoading(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('jd', formState.jd);
      formData.append('resume', formState.resume);
      const response = await fetch('/api/generate', { method: 'POST', body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to generate content');
      setResult(data);
      setActiveTab('resume');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const jdWordCount = formState.jd.trim() ? formState.jd.trim().split(/\s+/).length : 0;
  const canSubmit = formState.jd.trim().length > 0 && !!formState.resume && !isLoading;

  const previewResumeHtml = useMemo(
    () =>
      result
        ? renderResumeDocument(result.personalInfo, result.resume, 'preview')
        : '',
    [result]
  );
  const previewCoverHtml = useMemo(
    () =>
      result
        ? renderCoverLetterDocument(result.personalInfo, result.coverLetter, 'preview')
        : '',
    [result]
  );
  const pdfResumeHtml = useMemo(
    () => (result ? renderResumeDocument(result.personalInfo, result.resume, 'pdf') : ''),
    [result]
  );
  const pdfCoverHtml = useMemo(
    () =>
      result ? renderCoverLetterDocument(result.personalInfo, result.coverLetter, 'pdf') : '',
    [result]
  );

  const resumeFilename = result?.personalInfo.fullName
    ? `${result.personalInfo.fullName.replace(/[^a-z0-9]+/gi, '_')}_Resume.pdf`
    : 'resume.pdf';
  const coverFilename = result?.personalInfo.fullName
    ? `${result.personalInfo.fullName.replace(/[^a-z0-9]+/gi, '_')}_Cover_Letter.pdf`
    : 'cover-letter.pdf';

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      {/* Hero */}
      <header className="mb-10 sm:mb-14 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/70 text-xs font-medium mb-5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Free for 2 generations · no card · no signup
        </div>
        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight">
          <span className="block text-white">Beat the bots.</span>
          <span className="block gradient-text">Land the interview.</span>
        </h1>
        <p className="mt-5 text-white/60 max-w-xl mx-auto text-base sm:text-lg">
          Paste a job description, upload your resume — get an ATS-optimized rewrite, a tailored cover letter, and a match score in seconds.
        </p>
      </header>

      {/* Form */}
      <section className="relative">
        <div className="absolute -inset-1 rounded-3xl bg-gradient-to-br from-fuchsia-500/20 via-indigo-500/20 to-sky-400/20 blur-2xl" />
        <div className="relative rounded-3xl bg-slate-950/60 backdrop-blur-xl border border-white/10 p-6 md:p-8 shadow-2xl">
          <form onSubmit={handleSubmit}>
            <div className="grid lg:grid-cols-2 gap-6">
              {/* JD */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="jd" className="block text-sm font-semibold text-white">
                    Job description
                  </label>
                  <button
                    type="button"
                    onClick={loadSampleJD}
                    className="text-xs text-fuchsia-300 hover:text-fuchsia-200 font-medium"
                  >
                    Use sample
                  </button>
                </div>
                <textarea
                  id="jd"
                  value={formState.jd}
                  onChange={(e) => handleInputChange('jd', e.target.value)}
                  placeholder="Paste the full job description here…"
                  rows={14}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:ring-2 focus:ring-fuchsia-400/40 focus:border-fuchsia-400 outline-none resize-none text-sm leading-relaxed text-white placeholder:text-white/30 transition"
                />
                <div className="mt-1.5 flex justify-between text-xs text-white/40">
                  <span>Minimum ~50 characters</span>
                  <span>{jdWordCount} words</span>
                </div>
              </div>

              {/* File upload */}
              <div>
                <label htmlFor="resume" className="block text-sm font-semibold text-white mb-2">
                  Your resume
                </label>
                <label
                  htmlFor="resume"
                  className={`file-drop ${formState.resume ? 'has-file' : ''} flex flex-col items-center justify-center text-center px-4 py-10 rounded-xl cursor-pointer`}
                  style={{ minHeight: '15rem' }}
                >
                  {formState.resume ? (
                    <>
                      <svg className="w-10 h-10 text-emerald-400 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                        <path d="M14 2v6h6" />
                        <path d="M9 14l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <p className="text-sm font-medium text-emerald-200 break-all">{formState.resume.name}</p>
                      <p className="text-xs text-white/40 mt-1">
                        {(formState.resume.size / 1024).toFixed(1)} KB · click to replace
                      </p>
                    </>
                  ) : (
                    <>
                      <svg className="w-10 h-10 text-white/40 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                        <path d="M17 8l-5-5-5 5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M12 3v12" strokeLinecap="round" />
                      </svg>
                      <p className="text-sm font-medium text-white">Click to upload resume</p>
                      <p className="text-xs text-white/40 mt-1">PDF or DOCX · max 10MB</p>
                    </>
                  )}
                  <input
                    id="resume"
                    type="file"
                    accept=".pdf,.docx"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      if (file && file.size > 10 * 1024 * 1024) {
                        setError('Resume file is too large. Maximum size is 10MB.');
                        handleInputChange('resume', null);
                        e.target.value = '';
                      } else {
                        handleInputChange('resume', file);
                      }
                    }}
                  />
                </label>
                <p className="mt-2 text-xs text-white/40">
                  Files are processed in-memory and never stored.
                </p>
              </div>
            </div>

            {error && (
              <div className="mt-5 flex items-start gap-2.5 p-3.5 bg-rose-500/10 border border-rose-400/30 text-rose-200 rounded-xl text-sm">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10A8 8 0 11 2 10a8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <div className="mt-6 flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-3 sm:justify-between">
              <button
                type="button"
                onClick={clearForm}
                className="text-sm text-white/50 hover:text-white font-medium"
              >
                Clear all
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-fuchsia-500 via-indigo-500 to-sky-400 text-white font-semibold rounded-xl shadow-lg shadow-fuchsia-500/30 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.3" strokeWidth="4" />
                      <path d="M22 12a10 10 0 01-10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                    </svg>
                    Generating…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M10 1.5l1.7 4.6 4.8.4-3.6 3.2 1.1 4.7L10 11.9l-4 2.5 1.1-4.7L3.5 6.5l4.8-.4L10 1.5z" />
                    </svg>
                    Generate
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </section>

      {isLoading && !result && (
        <section className="mt-8 rounded-3xl border border-white/10 bg-slate-950/60 backdrop-blur-xl">
          <LoadingSpinner />
        </section>
      )}

      {result && (
        <section className="mt-10 space-y-6">
          <ATSScore
            originalScore={result.originalScore}
            score={result.score}
            matched={result.matchedKeywords}
            missing={result.missingKeywords}
          />

          {!result.usage.downloadAllowed && (
            <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 flex items-start gap-3 text-amber-100 text-sm">
              <svg className="w-5 h-5 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 1a4 4 0 00-4 4v3H5a2 2 0 00-2 2v7a2 2 0 002 2h10a2 2 0 002-2v-7a2 2 0 00-2-2h-1V5a4 4 0 00-4-4z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <p className="font-medium">You've used your free generations.</p>
                <p className="mt-0.5 text-amber-200/80 text-xs">
                  Sign in (free) to download this resume and continue generating.
                </p>
              </div>
              <Link
                href="/signup"
                className="px-3 py-1.5 bg-white text-slate-950 rounded-md font-semibold text-xs hover:bg-white/90 transition"
              >
                Sign up free
              </Link>
            </div>
          )}

          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold tracking-tight text-white">Results</h2>
            <div className="inline-flex bg-white/5 rounded-xl p-1 border border-white/10">
              <button
                type="button"
                onClick={() => setActiveTab('resume')}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition ${
                  activeTab === 'resume'
                    ? 'bg-gradient-to-r from-fuchsia-500 to-indigo-500 text-white shadow'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                Resume
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('cover')}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition ${
                  activeTab === 'cover'
                    ? 'bg-gradient-to-r from-fuchsia-500 to-indigo-500 text-white shadow'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                Cover letter
              </button>
            </div>
          </div>

          {activeTab === 'resume' ? (
            <ResumePreview
              previewHtml={previewResumeHtml}
              downloadHtml={pdfResumeHtml}
              title="ATS-Optimized Resume"
              filename={resumeFilename}
              downloadAllowed={result.usage.downloadAllowed}
              onDownload={downloadPDF}
              onCopy={copyToClipboard}
              onLockedAction={() => setShowSigninModal(true)}
            />
          ) : (
            <ResumePreview
              previewHtml={previewCoverHtml}
              downloadHtml={pdfCoverHtml}
              title="Tailored Cover Letter"
              filename={coverFilename}
              downloadAllowed={result.usage.downloadAllowed}
              onDownload={downloadPDF}
              onCopy={copyToClipboard}
              onLockedAction={() => setShowSigninModal(true)}
            />
          )}
        </section>
      )}

      {showSigninModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setShowSigninModal(false)}>
          <div
            className="relative max-w-sm w-full rounded-3xl bg-slate-950 border border-white/10 p-7 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute -inset-1 -z-10 rounded-3xl bg-gradient-to-br from-fuchsia-500/30 via-indigo-500/30 to-sky-400/30 blur-xl" />
            <h3 className="text-xl font-bold text-white">Sign in to download</h3>
            <p className="mt-1 text-sm text-white/60">
              You've reached the free limit ({result?.usage.freeLimit} generations). Create a free account to download and keep generating.
            </p>
            <div className="mt-5 grid gap-2.5">
              <Link
                href="/signup"
                className="block text-center py-2.5 rounded-lg bg-gradient-to-r from-fuchsia-500 via-indigo-500 to-sky-400 text-white font-semibold hover:opacity-90 transition"
              >
                Create free account
              </Link>
              <Link
                href="/signin"
                className="block text-center py-2.5 rounded-lg bg-white/5 border border-white/10 text-white font-medium hover:bg-white/10 transition"
              >
                I already have an account
              </Link>
            </div>
          </div>
        </div>
      )}

      <footer className="mt-16 mb-6 text-center text-xs text-white/40">
        Built with care. Inputs are processed in-memory and discarded after generation.
      </footer>
    </main>
  );
}
