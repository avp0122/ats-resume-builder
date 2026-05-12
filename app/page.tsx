'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import ResumePreview from '@/components/ResumePreview';
import LoadingSpinner from '@/components/LoadingSpinner';
import ATSScore from '@/components/ATSScore';
import type { PersonalInfo } from '@/lib/llm';
import { renderCoverLetterDocument, renderResumeDocument } from '@/lib/resumeTemplate';
import { detectClient, type ClientInfo } from '@/lib/clientInfo';

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
    signedIn: boolean;
    plan: 'free' | 'pro';
    proUntil: string | null;
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
  // `hydrated` flips true once React is fully mounted on the client. Until
  // then we don't accept file-input changes (they'd be lost into a half-
  // hydrated React tree). Belt-and-suspenders: an extra native change
  // listener attached via ref captures any selection that fires the very
  // first millisecond after mount, before React's synthetic event system
  // is rebound.
  const [hydrated, setHydrated] = useState(false);
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setHydrated(true);
    // Async OS sniff (uses navigator.userAgentData when available).
    detectClient().then(setClient).catch(() => setClient(null));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const input = fileInputRef.current;
    if (!input) return;
    const onChange = () => {
      const file = input.files?.[0] || null;
      if (file && file.size > 10 * 1024 * 1024) {
        setError('Resume file is too large. Maximum size is 10MB.');
        setFormState((prev) => ({ ...prev, resume: null }));
        input.value = '';
        return;
      }
      setFormState((prev) => ({ ...prev, resume: file }));
      setError(null);
    };
    input.addEventListener('change', onChange);
    return () => input.removeEventListener('change', onChange);
  }, [hydrated]);

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
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /**
   * Render a styled HTML document into a PDF Blob (A4 portrait).
   * Mounted off-screen with an explicit width so html2canvas can snapshot it.
   */
  const renderPdfBlob = useCallback(async (htmlContent: string): Promise<Blob> => {
    const A4_WIDTH_PX = 794; // A4 portrait at 96dpi
    const wrapper = document.createElement('div');
    wrapper.style.position = 'absolute';
    wrapper.style.top = '0';
    wrapper.style.left = '0';
    wrapper.style.width = `${A4_WIDTH_PX}px`;
    wrapper.style.background = '#ffffff';
    wrapper.style.zIndex = '-1';
    wrapper.style.opacity = '0';
    wrapper.style.pointerEvents = 'none';
    wrapper.innerHTML = htmlContent;
    document.body.appendChild(wrapper);

    // Yield twice so layout/fonts settle before snapshot.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const opt = {
      margin: [12, 12, 12, 12] as [number, number, number, number],
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        windowWidth: A4_WIDTH_PX,
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] as any },
    };

    const { default: html2pdf } = await import('html2pdf.js');
    try {
      const blob = (await html2pdf()
        .set(opt)
        .from(wrapper.firstElementChild || wrapper)
        .output('blob')) as Blob;
      return blob;
    } finally {
      wrapper.remove();
    }
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

  /**
   * Download a single ZIP containing the resume + cover letter PDFs.
   * Filenames include the detected client OS (e.g. "windows_11") so future
   * customization workflows can route based on platform.
   *
   * TODO: when the Windows-customization API is available, branch here:
   * if `client?.os === 'windows'`, POST `pdfResumeHtml` to that endpoint,
   * swap the returned Blob into the ZIP under the same filename scheme.
   */
  const downloadZip = useCallback(async () => {
    if (!result) return;
    if (!result.usage.downloadAllowed) {
      setShowSigninModal(true);
      return;
    }
    setDownloading(true);
    setDownloadError(null);
    try {
      const [resumeBlob, coverBlob, JSZipMod] = await Promise.all([
        renderPdfBlob(pdfResumeHtml),
        renderPdfBlob(pdfCoverHtml),
        import('jszip'),
      ]);
      const JSZip = JSZipMod.default;

      const slug = client?.slug || 'unknown';
      const personSlug =
        result.personalInfo.fullName.replace(/[^a-z0-9]+/gi, '_').toLowerCase() ||
        'kresume';
      const baseName = `${personSlug}_${slug}`;

      const zip = new JSZip();
      zip.file(`${baseName}_resume.pdf`, resumeBlob);
      zip.file(`${baseName}_cover_letter.pdf`, coverBlob);
      const zipBlob = await zip.generateAsync({ type: 'blob' });

      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('ZIP download failed:', e);
      setDownloadError(
        e instanceof Error ? e.message : 'Could not build the download. Please try again.'
      );
    } finally {
      setDownloading(false);
    }
  }, [client, pdfResumeHtml, pdfCoverHtml, renderPdfBlob, result]);

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      {/* Hero */}
      <header className="mb-10 sm:mb-14 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/70 text-xs font-medium mb-5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          1 free generation, no card or signup
        </div>
        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight">
          <span className="block text-white">Beat the bots.</span>
          <span className="block gradient-text">Land the interview.</span>
        </h1>
        <p className="mt-5 text-white/60 max-w-xl mx-auto text-base sm:text-lg">
          Paste a job description, upload your resume — get an ATS-optimized rewrite, a tailored cover letter, and a match score in seconds.
        </p>

        <div className="mt-7 grid sm:grid-cols-3 gap-2 max-w-2xl mx-auto text-xs">
          <TierBadge label="Anonymous" value="1 generation" tone="muted" />
          <TierBadge label="Free + signed up" value="3 / month" tone="muted" />
          <TierBadge label="Pro" value="Unlimited · $4.99/mo" tone="vibrant" />
        </div>
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
                  aria-disabled={!hydrated}
                  className={`file-drop ${formState.resume ? 'has-file' : ''} ${
                    hydrated ? 'cursor-pointer' : 'cursor-wait opacity-60'
                  } flex flex-col items-center justify-center text-center px-4 py-10 rounded-xl`}
                  style={{ minHeight: '15rem' }}
                  onClick={(e) => {
                    if (!hydrated) e.preventDefault();
                  }}
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
                      <p className="text-sm font-medium text-white">
                        {hydrated ? 'Click to upload resume' : 'Loading…'}
                      </p>
                      <p className="text-xs text-white/40 mt-1">PDF or DOCX · max 10MB</p>
                    </>
                  )}
                  <input
                    id="resume"
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx"
                    className="hidden"
                    disabled={!hydrated}
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
                {result.usage.signedIn ? (
                  <>
                    <p className="font-medium">You've used your {result.usage.freeLimit} free generations.</p>
                    <p className="mt-0.5 text-amber-200/80 text-xs">
                      Upgrade to Pro for unlimited generations and downloads — $4.99/month, paid in crypto.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-medium">You've used your free generation.</p>
                    <p className="mt-0.5 text-amber-200/80 text-xs">
                      Sign up free to get 3 generations / month, or upgrade to Pro for unlimited.
                    </p>
                  </>
                )}
              </div>
              <Link
                href={result.usage.signedIn ? '/pricing' : '/signup'}
                className="px-3 py-1.5 bg-white text-slate-950 rounded-md font-semibold text-xs hover:bg-white/90 transition whitespace-nowrap"
              >
                {result.usage.signedIn ? 'Upgrade' : 'Sign up free'}
              </Link>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-xl font-semibold tracking-tight text-white">Results</h2>
            <div className="flex items-center gap-2 self-start sm:self-auto">
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
              <button
                type="button"
                onClick={downloadZip}
                disabled={downloading}
                title={
                  client?.os && client.os !== 'unknown'
                    ? `Downloads will be tagged for your ${client.os}${
                        client.version ? ' ' + client.version : ''
                      } client`
                    : undefined
                }
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition shadow ${
                  result.usage.downloadAllowed
                    ? 'bg-gradient-to-r from-amber-400 via-fuchsia-500 to-indigo-500 text-slate-950 hover:opacity-90'
                    : 'bg-white/10 text-white/70 hover:bg-white/15'
                } disabled:opacity-60 disabled:cursor-not-allowed`}
              >
                {downloading ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.3" strokeWidth="4" />
                      <path d="M22 12a10 10 0 01-10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                    </svg>
                    Preparing…
                  </>
                ) : result.usage.downloadAllowed ? (
                  <>
                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M10 3v10m0 0l-3.5-3.5M10 13l3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Download .zip
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M10 1a4 4 0 00-4 4v3H5a2 2 0 00-2 2v7a2 2 0 002 2h10a2 2 0 002-2v-7a2 2 0 00-2-2h-1V5a4 4 0 00-4-4zm2 7V5a2 2 0 10-4 0v3h4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Sign in to download
                  </>
                )}
              </button>
            </div>
          </div>

          {downloadError && (
            <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 text-rose-200 text-sm p-3">
              {downloadError}
            </div>
          )}

          {activeTab === 'resume' ? (
            <ResumePreview
              previewHtml={previewResumeHtml}
              title="ATS-Optimized Resume"
            />
          ) : (
            <ResumePreview
              previewHtml={previewCoverHtml}
              title="Tailored Cover Letter"
              copyText={pdfCoverHtml}
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
            {result?.usage.signedIn ? (
              <>
                <h3 className="text-xl font-bold text-white">Upgrade to Pro</h3>
                <p className="mt-1 text-sm text-white/60">
                  You've used your {result.usage.freeLimit} free generations. Pro gives you unlimited generations + downloads for $4.99/month, paid in crypto.
                </p>
                <div className="mt-5 grid gap-2.5">
                  <Link
                    href="/pricing"
                    className="block text-center py-2.5 rounded-lg bg-gradient-to-r from-amber-400 via-fuchsia-500 to-indigo-500 text-slate-950 font-semibold hover:opacity-90 transition"
                  >
                    See pricing
                  </Link>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-xl font-bold text-white">Sign in to download</h3>
                <p className="mt-1 text-sm text-white/60">
                  You've used your free generation. Sign up free to get {result?.usage.freeLimit ?? 3} more per month, or sign in if you already have an account.
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
              </>
            )}
          </div>
        </div>
      )}

      <footer className="mt-16 mb-6 text-center text-xs text-white/40">
        Built with care. Inputs are processed in-memory and discarded after generation.
      </footer>
    </main>
  );
}

function TierBadge({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'muted' | 'vibrant';
}) {
  const styles =
    tone === 'vibrant'
      ? 'border-fuchsia-400/40 bg-fuchsia-500/10 text-white'
      : 'border-white/10 bg-white/[0.03] text-white/70';
  return (
    <div className={`rounded-xl border ${styles} px-3 py-2 flex items-center justify-between gap-2`}>
      <span className="font-medium">{label}</span>
      <span className="opacity-90">{value}</span>
    </div>
  );
}
