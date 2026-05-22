'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import ResumePreview from '@/components/ResumePreview';
import LoadingSpinner from '@/components/LoadingSpinner';
import ATSScore from '@/components/ATSScore';
import type { PersonalInfo } from '@/lib/llm';
import { renderCoverLetterDocument, renderResumeDocument } from '@/lib/resumeTemplate';
import { detectClient, type ClientInfo } from '@/lib/clientInfo';

interface InputStats {
  jdWords: number;
  jdTokens: number;
  resumeWords: number;
  resumeTokens: number;
}

interface QuotaInfo {
  signedIn: boolean;
  plan: 'free' | 'pro';
  count: number;
  freeLimit: number;
  remaining: number | null;
  proUntil: string | null;
  upgradeRequired: boolean;
}

interface GenerationResult {
  personalInfo: PersonalInfo;
  jobRole: string;
  jobCompany: string;
  resume: string;
  coverLetter: string;
  originalScore: number;
  score: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  inputStats?: InputStats;
  usage: {
    count: number;
    freeLimit: number;
    // Server returns `remaining` on success and on the 402-cap response.
    // Pro users get null (unlimited).
    remaining?: number | null;
    downloadAllowed: boolean;
    needsSignin: boolean;
    signedIn: boolean;
    plan: 'free' | 'pro';
    proUntil: string | null;
    upgradeRequired?: boolean;
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
  // showSigninModal removed — paywall is now an inline card replacing the
  // preview, not a modal.
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
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  // Drag-and-drop UI feedback. `dragDepth` counts nested dragenter
  // events so child elements inside the drop zone don't flicker the
  // "is-dragging" state to false on every internal traverse.
  const [dragDepth, setDragDepth] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isDragging = dragDepth > 0;

  useEffect(() => {
    setHydrated(true);
    // Async OS sniff (uses navigator.userAgentData when available).
    detectClient().then(setClient).catch(() => setClient(null));
    // Pre-fetch the quota so we can disable the Generate button BEFORE the
    // user pays for an LLM call they're not allowed to make.
    fetch('/api/usage', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((q) => q && setQuota(q))
      .catch(() => {
        /* non-fatal: server-side gate still applies */
      });
  }, []);

  // Single accept path used by both the <input type="file"> change
  // listener and the drag-and-drop drop handler. Centralising the rules
  // here means click-to-select and drag-drop reject the same files for
  // the same reasons (extension + size).
  const acceptResumeFile = useCallback((file: File | null) => {
    if (!file) {
      setFormState((prev) => ({ ...prev, resume: null }));
      return;
    }
    // Extension check — some browsers report empty MIME for .docx so we
    // fall back to the filename. Matches the `accept=".pdf,.docx"`
    // attribute on the file input.
    const name = file.name.toLowerCase();
    const looksLikeResume =
      name.endsWith('.pdf') ||
      name.endsWith('.docx') ||
      file.type === 'application/pdf' ||
      file.type ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (!looksLikeResume) {
      setError('Resume must be a PDF or DOCX file.');
      setFormState((prev) => ({ ...prev, resume: null }));
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Resume file is too large. Maximum size is 10MB.');
      setFormState((prev) => ({ ...prev, resume: null }));
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setFormState((prev) => ({ ...prev, resume: file }));
    setError(null);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const input = fileInputRef.current;
    if (!input) return;
    const onChange = () => acceptResumeFile(input.files?.[0] || null);
    input.addEventListener('change', onChange);
    return () => input.removeEventListener('change', onChange);
  }, [hydrated, acceptResumeFile]);

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
    // 703px = 186mm at 96dpi = A4 page width minus the 12mm jsPDF margin
    // on each side. MUST match PDF_WIDTH_PX in lib/resumeTemplate.ts. If
    // this is bigger than the content area, jsPDF clips the right side
    // and produces an asymmetric left/right margin.
    const A4_CONTENT_WIDTH_PX = 703;
    const wrapper = document.createElement('div');
    wrapper.style.position = 'absolute';
    wrapper.style.top = '0';
    wrapper.style.left = '0';
    wrapper.style.width = `${A4_CONTENT_WIDTH_PX}px`;
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
        windowWidth: A4_CONTENT_WIDTH_PX,
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
      // `avoid-all` would inject page-break-inside:avoid on EVERY
      // element, which causes html2pdf to push the entire first
      // body block to page 2 whenever it doesn't fit cleanly below
      // the header — producing a near-empty page 1 with just the
      // contact info. Use only css + legacy so our targeted breaks
      // in lib/resumeTemplate.ts (avoid orphan headings, avoid
      // splitting bullets) are the only break hints.
      pagebreak: { mode: ['css', 'legacy'] as any },
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

  // Map the `usage` block on a /api/generate response (success OR
  // 402-upgrade-required) into the QuotaInfo shape and update local
  // quota state. Pre-fix `quota` was only fetched once on mount, so
  // after a generation the "X of 3 remaining" banner stayed stale —
  // a user who'd just hit the cap would see both an "all 3 used"
  // error AND a "2 of 3 remaining" banner at the same time.
  const applyQuotaFromResponse = useCallback(
    (usage: GenerationResult['usage'] | undefined) => {
      if (!usage) return;
      const remaining =
        typeof usage.remaining === 'number'
          ? usage.remaining
          : usage.plan === 'pro'
          ? null
          : Math.max(0, usage.freeLimit - usage.count);
      setQuota({
        signedIn: usage.signedIn,
        plan: usage.plan,
        count: usage.count,
        freeLimit: usage.freeLimit,
        remaining,
        proUntil: usage.proUntil,
        upgradeRequired:
          'upgradeRequired' in usage && typeof usage.upgradeRequired === 'boolean'
            ? usage.upgradeRequired
            : usage.signedIn && usage.plan === 'free' && remaining === 0,
      });
    },
    []
  );

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
      // Tell the server which OS the user is on so it can be logged with
      // this upload (used for support / customization routing).
      if (client?.os) formData.append('client_os', client.os);
      if (client?.version) formData.append('client_version', client.version);
      const response = await fetch('/api/generate', { method: 'POST', body: formData });
      const data = await response.json();
      // Refresh quota from whichever response shape we got — success
      // responses always carry `usage`; the 402-quota-exhausted error
      // also includes `usage` so we can flip the banner to UpgradePromo
      // immediately even on the failed call.
      applyQuotaFromResponse(data?.usage);
      if (!response.ok) throw new Error(data.error || 'Failed to generate content');
      setResult(data);
      setActiveTab('resume');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const jdTrimmed = formState.jd.trim();
  const jdWordCount = jdTrimmed ? jdTrimmed.split(/\s+/).length : 0;
  // chars/3 mirrors lib/utils.ts estimateTokens. Pessimistic vs.
  // chars/4 because Groq's actual tokenizer disagrees more on
  // URL-heavy / code-heavy text than chars/4 suggests.
  const jdTokenCount = jdTrimmed ? Math.ceil(jdTrimmed.length / 3) : 0;
  // Free-tier soft caps mirror lib/llm.ts (TPM 12000 − 1200 safety −
  // 2500 output = 8300 input) and the per-input JD cap in
  // /api/generate (2500). Server auto-truncates anyway, but we warn
  // the user before they submit so they can trim if they want.
  const TOKEN_BUDGET = 8300;
  const JD_TOKEN_SOFT_CAP = 2500;
  const overBudget = jdTokenCount > JD_TOKEN_SOFT_CAP;
  // Signed-in free user who has used all 3 generations — Generate is gated.
  const quotaExhausted =
    !!quota && quota.signedIn && quota.plan === 'free' && quota.remaining === 0;
  const canSubmit =
    formState.jd.trim().length > 0 &&
    !!formState.resume &&
    !isLoading &&
    !quotaExhausted;

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
   * Download a single ZIP containing the resume + cover letter in both
   * PDF and DOCX formats (4 files total — DOCX is preferred by many
   * ATS parsers, PDF is the canonical print format).
   * Filenames include the detected client OS (e.g. "windows_11") so future
   * customization workflows can route based on platform.
   *
   * TODO: when the Windows-customization API is available, branch here:
   * if `client?.os === 'windows'`, POST `pdfResumeHtml` to that endpoint,
   * swap the returned Blob into the ZIP under the same filename scheme.
   */
  /**
   * Convert the rendered resume/cover-letter HTML to a Word .docx Blob.
   * Many ATS systems prefer DOCX over PDF (they parse it as actual
   * structured Office Open XML rather than re-extracting text from PDF
   * glyphs), so we ship both formats inside the same ZIP.
   *
   * Uses @turbodocx/html-to-docx which produces real OOXML — Word and
   * Google Docs both open it cleanly. The library is browser-safe so
   * we keep generation entirely client-side (no extra server load,
   * no extra Vercel function cold-start).
   */
  const renderDocxBlob = useCallback(async (htmlContent: string): Promise<Blob> => {
    const mod = await import('@turbodocx/html-to-docx');
    const HTMLtoDOCX: any = (mod as any).default ?? mod;
    // Standard US Letter at 1" margins. Returns Blob in browser.
    const result = await HTMLtoDOCX(htmlContent, undefined, {
      orientation: 'portrait',
      margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 }, // 1" each
      font: 'Calibri',
      fontSize: 22, // half-points → 11pt
    });
    return result instanceof Blob
      ? result
      : new Blob([result], {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });
  }, []);

  const downloadZip = useCallback(async () => {
    if (!result) return;
    // The download button is only rendered when downloadAllowed is true, but
    // guard anyway to make the contract explicit.
    if (!result.usage.downloadAllowed) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      // PDFs render in parallel; DOCX in parallel too. All four blobs
      // start at the same time so download-prep is ~max-of-four rather
      // than sum.
      const [resumeBlob, coverBlob, resumeDocxBlob, coverDocxBlob, JSZipMod] =
        await Promise.all([
          renderPdfBlob(pdfResumeHtml),
          renderPdfBlob(pdfCoverHtml),
          renderDocxBlob(pdfResumeHtml),
          renderDocxBlob(pdfCoverHtml),
          import('jszip'),
        ]);
      const JSZip = JSZipMod.default;

      // Filename: <role>_<company>_<fullname> so a user who runs multiple
      // generations against different jobs can tell their downloads apart.
      // Each component is sanitised + truncated. Any missing piece is just
      // skipped so the filename stays readable.
      const slug = (s: string, max = 32) =>
        s
          .replace(/[^a-z0-9]+/gi, '_')
          .replace(/^_+|_+$/g, '')
          .toLowerCase()
          .slice(0, max);
      // Per-PDF filenames are derived from the candidate's name only
      // (fullname_resume.pdf / fullname_coverletter.pdf) so the file inside
      // the ZIP is portable and recognizable regardless of which job it was
      // generated for. The ZIP filename itself still embeds the role +
      // company so a user juggling multiple applications can tell their
      // downloads apart.
      const nameSlug = slug(result.personalInfo.fullName) || 'kairesume';
      const zipParts = [
        slug(result.jobRole),
        slug(result.jobCompany),
        slug(result.personalInfo.fullName),
      ].filter(Boolean);
      const zipBaseName = zipParts.length > 0 ? zipParts.join('_') : 'kairesume';

      const zip = new JSZip();
      zip.file(`${nameSlug}_resume.pdf`, resumeBlob);
      zip.file(`${nameSlug}_resume.docx`, resumeDocxBlob);
      zip.file(`${nameSlug}_coverletter.pdf`, coverBlob);
      zip.file(`${nameSlug}_coverletter.docx`, coverDocxBlob);
      const zipBlob = await zip.generateAsync({ type: 'blob' });

      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${zipBaseName}.zip`;
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
  }, [client, pdfResumeHtml, pdfCoverHtml, renderPdfBlob, renderDocxBlob, result]);

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
        <p className="mt-4 text-base sm:text-lg font-semibold text-amber-200">
          kairesume is the cheapest AI resume builder — free to try, $4.99/mo Pro.
        </p>
        <p className="mt-3 text-white/60 max-w-xl mx-auto text-base sm:text-lg">
          Paste a job description, upload your resume — get a free, AI-tailored,
          ATS-optimized rewrite, a high-scoring cover letter, and an interview-best-match
          score in seconds.
        </p>

        <div className="mt-7 grid sm:grid-cols-3 gap-2 max-w-2xl mx-auto text-xs">
          <TierBadge label="Anonymous" value="1 generation" tone="muted" />
          <TierBadge label="Free + signed up" value="3 / month" tone="muted" />
          <TierBadge label="Pro" value="Unlimited · $4.99/mo" tone="vibrant" />
        </div>
      </header>

      {/* Quota / upgrade promo for signed-in free users */}
      {quota && quota.signedIn && quota.plan === 'free' && (
        <section className="mb-6">
          {quotaExhausted ? (
            <UpgradePromo limit={quota.freeLimit} />
          ) : (
            <RemainingBanner
              remaining={quota.remaining ?? quota.freeLimit}
              limit={quota.freeLimit}
            />
          )}
        </section>
      )}

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
                  <span>
                    {jdWordCount} words ·{' '}
                    <span className={overBudget ? 'text-rose-300 font-medium' : ''}>
                      ~{jdTokenCount} tokens
                    </span>
                  </span>
                </div>
                {overBudget && (
                  <p className="mt-1.5 text-[11px] text-rose-300/90 leading-snug">
                    Job description is long — ~{jdTokenCount} of the ~{TOKEN_BUDGET}-token
                    free-tier budget (combined with your resume). Trim it or you may exceed the
                    rate limit.
                  </p>
                )}
              </div>

              {/* File upload — click OR drag & drop. The whole label is a
                  drop zone; we count nested dragenter events so child
                  elements inside don't flicker the highlight off as the
                  pointer moves over them. */}
              <div>
                <label htmlFor="resume" className="block text-sm font-semibold text-white mb-2">
                  Your resume
                </label>
                <label
                  htmlFor="resume"
                  aria-disabled={!hydrated}
                  className={`file-drop ${formState.resume ? 'has-file' : ''} ${
                    isDragging ? 'is-dragging' : ''
                  } ${
                    hydrated ? 'cursor-pointer' : 'cursor-wait opacity-60'
                  } flex flex-col items-center justify-center text-center px-4 py-10 rounded-xl transition`}
                  style={{ minHeight: '15rem' }}
                  onClick={(e) => {
                    if (!hydrated) e.preventDefault();
                  }}
                  onDragEnter={(e) => {
                    if (!hydrated) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setDragDepth((d) => d + 1);
                  }}
                  onDragOver={(e) => {
                    if (!hydrated) return;
                    // preventDefault is REQUIRED on dragover to indicate
                    // that this element accepts drops — without it the
                    // drop event never fires and the browser opens the
                    // file in a new tab instead.
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'copy';
                  }}
                  onDragLeave={(e) => {
                    if (!hydrated) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setDragDepth((d) => Math.max(0, d - 1));
                  }}
                  onDrop={(e) => {
                    if (!hydrated) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setDragDepth(0);
                    const file = e.dataTransfer.files?.[0] || null;
                    acceptResumeFile(file);
                  }}
                >
                  {isDragging && !formState.resume ? (
                    <>
                      <svg className="w-10 h-10 text-fuchsia-300 mb-2 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M12 16V4m0 0l-4 4m4-4l4 4" strokeLinecap="round" strokeLinejoin="round" />
                        <rect x="3" y="14" width="18" height="6" rx="2" />
                      </svg>
                      <p className="text-sm font-semibold text-fuchsia-200">Drop your resume to upload</p>
                      <p className="text-xs text-white/50 mt-1">PDF or DOCX · max 10MB</p>
                    </>
                  ) : formState.resume ? (
                    <>
                      <svg className="w-10 h-10 text-emerald-400 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                        <path d="M14 2v6h6" />
                        <path d="M9 14l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <p className="text-sm font-medium text-emerald-200 break-all">{formState.resume.name}</p>
                      <p className="text-xs text-white/40 mt-1">
                        {(formState.resume.size / 1024).toFixed(1)} KB · click or drop to replace
                      </p>
                      <p className="text-[11px] text-white/40 mt-0.5">
                        Token count shown after generation
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
                        {hydrated ? 'Drag & drop your resume here' : 'Loading…'}
                      </p>
                      {hydrated && (
                        <p className="text-xs text-white/50 mt-1">
                          or <span className="underline decoration-white/30">click to browse</span>
                        </p>
                      )}
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
          {result.inputStats && <InputStatsCard stats={result.inputStats} />}
          <ATSScore
            originalScore={result.originalScore}
            score={result.score}
            matched={result.matchedKeywords}
            missing={result.missingKeywords}
          />

          {(() => {
            // Three result states we have to render:
            //   1. downloadAllowed → full preview + working download
            //   2. anonymous (!signedIn && !downloadAllowed) → blurred preview
            //      with a disabled Download button. Visitors can SEE the
            //      result (proof we did the work) but must sign up free
            //      to actually use it. Per product ask.
            //   3. signed-in free user at the cap → original PaywallCard
            //      / UpgradePromo (Pro is the only unlock).
            const anonymous = !result.usage.signedIn && !result.usage.downloadAllowed;
            const showPreview = result.usage.downloadAllowed || anonymous;

            if (!showPreview) {
              return (
                <PaywallCard
                  signedIn={result.usage.signedIn}
                  freeLimit={result.usage.freeLimit}
                />
              );
            }

            return (
              <>
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
                    <DownloadButton
                      onClick={downloadZip}
                      disabled={anonymous || downloading}
                      downloading={downloading}
                      lockedReason={anonymous ? 'Sign up free to download' : undefined}
                    />
                  </div>
                </div>

                {anonymous && (
                  <div className="rounded-xl border border-amber-400/30 bg-amber-500/5 text-amber-100/90 p-3.5 text-xs flex items-start gap-2">
                    <svg className="w-4 h-4 mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                      <path
                        fillRule="evenodd"
                        d="M10 1a4 4 0 00-4 4v3H5a2 2 0 00-2 2v7a2 2 0 002 2h10a2 2 0 002-2v-7a2 2 0 00-2-2h-1V5a4 4 0 00-4-4zm2 7V5a2 2 0 10-4 0v3h4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <div>
                      <span className="font-semibold text-amber-200">Preview locked.</span>{' '}
                      Sign up free to view the full optimized resume + cover letter and
                      download the PDF — no card required.
                      <Link
                        href="/signup"
                        className="ml-2 underline decoration-amber-300/50 hover:decoration-amber-200 text-amber-100 font-semibold"
                      >
                        Sign up →
                      </Link>
                    </div>
                  </div>
                )}

                {downloadError && (
                  <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 text-rose-200 text-sm p-3">
                    {downloadError}
                  </div>
                )}

                <BlurGate locked={anonymous}>
                  {activeTab === 'resume' ? (
                    <ResumePreview
                      previewHtml={previewResumeHtml}
                      title="ATS-Optimized Resume"
                    />
                  ) : (
                    <ResumePreview
                      previewHtml={previewCoverHtml}
                      title="Tailored Cover Letter"
                      copyText={anonymous ? undefined : pdfCoverHtml}
                    />
                  )}
                </BlurGate>
              </>
            );
          })()}
        </section>
      )}

      <SeoContent />

      <footer className="mt-16 mb-6 text-center text-xs text-white/40">
        Built with care. Inputs are processed in-memory and discarded after generation.
      </footer>
    </main>
  );
}

function SeoContent() {
  // Crawlable, keyword-rich content for organic search. Visible (not hidden)
  // so it counts for SEO and isn't penalised as cloaking. The phrasing is
  // built around the high-intent search terms: "free AI resume builder",
  // "cheapest AI resume builder", "ATS resume", "tailored cover letter",
  // "interview best match", "high scorer".
  // Q/A phrasing is deliberately matchy to common search-engine and
  // chat-engine queries ("is X free", "best ATS resume builder", "how
  // long does X take") so AI answer engines can quote a single
  // sentence-level answer directly.
  const faqs = [
    {
      q: 'Is kairesume really the cheapest AI resume builder?',
      a: 'Yes. The free tier gives you an AI-tailored, ATS-optimized resume and cover letter with zero signup. Pro is $4.99/month for unlimited generations — and the 1-year plan drops the effective rate to $3.49/month (30% off).',
    },
    {
      q: 'Is kairesume free?',
      a: 'Yes. You get one free generation without signing up and three free generations per month after a free account is created. No card is required at any tier.',
    },
    {
      q: 'How does the ATS resume optimization work?',
      a: 'kairesume extracts the explicit requirements from the job description, rewrites the resume to surface matching keywords and quantified achievements, and scores the result against the role. Output is plain ATS-clean HTML — no tables, columns, graphics, headers, or footers.',
    },
    {
      q: 'How long does generation take?',
      a: 'Typically 5 to 15 seconds end-to-end, depending on the AI provider load. The result includes the rewritten resume, a tailored cover letter, an ATS score, and the matched + missing keyword breakdown.',
    },
    {
      q: 'Will the AI invent skills I don’t have?',
      a: 'No. The prompt explicitly forbids inventing experience that isn’t in your original resume. Important missing keywords are surfaced in a separate "missing" list so you know what to legitimately add over time.',
    },
    {
      q: 'Do I get a tailored cover letter too?',
      a: 'Yes. Every generation produces both a tailored resume and a 3–4 paragraph cover letter aligned to the same job description and keyword set.',
    },
    {
      q: 'How do I become the high scorer for a specific job?',
      a: 'Paste the full job description, upload your latest resume, and let kairesume rewrite it. The match-score panel tells you which keywords were covered and which to add for an interview-best-match outcome.',
    },
    {
      q: 'What file formats are supported?',
      a: 'Upload PDF or DOCX (up to 10 MB). The output is downloaded as a ZIP containing four files — fullname_resume.pdf, fullname_resume.docx, fullname_coverletter.pdf, fullname_coverletter.docx — with the target role and company embedded in the ZIP filename. DOCX is often preferred by ATS parsers.',
    },
    {
      q: 'How do I pay for Pro?',
      a: 'Pay in USDT on Tron (TRC-20) or Ethereum (ERC-20). There is no card on file and no auto-renew — every renewal is a fresh on-chain payment, so you can cancel by simply not paying.',
    },
    {
      q: 'Does kairesume store my resume?',
      a: 'The raw resume file and the job description text are processed in memory by the AI provider and discarded after the response is returned. Only structured metadata (target role, target company, ATS score, contact fields parsed from the resume) is persisted in our database, attached to your account.',
    },
  ];

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  return (
    <section className="mt-16 sm:mt-20" aria-labelledby="seo-heading">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <div className="rounded-3xl border border-white/10 bg-slate-950/40 backdrop-blur-md p-6 sm:p-10">
        <h2 id="seo-heading" className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
          The free, AI-tailored resume builder for ATS high scorers
        </h2>
        <p className="mt-3 text-white/70 max-w-2xl leading-relaxed">
          kairesume is the cheapest AI resume builder online: a free, AI-powered tool that
          rewrites your resume against any job description, produces a tailored cover letter,
          and scores you for interview best match. Built for ATS — Applicant Tracking
          Systems — so recruiters actually see your application.
        </p>

        <div className="mt-8 grid sm:grid-cols-2 gap-4">
          <SeoBullet title="Free AI resume builder">
            One free generation, no signup. Three free generations per month after signing
            up. Pay only if you need unlimited — Pro is $4.99/month.
          </SeoBullet>
          <SeoBullet title="ATS-optimized & tailored">
            Every resume is rewritten with the keywords, action verbs, and quantified
            achievements the job description asks for — formatted ATS-clean.
          </SeoBullet>
          <SeoBullet title="Interview best match score">
            See exactly which keywords matched, which are missing, and how high you score
            against the role before you apply.
          </SeoBullet>
          <SeoBullet title="High scorer cover letter">
            Get a tailored, role-specific cover letter alongside the resume — already
            aligned to the same best-match keywords.
          </SeoBullet>
        </div>

        <h3 className="mt-10 text-xl font-semibold text-white">FAQ</h3>
        <dl className="mt-4 space-y-5">
          {faqs.map((f) => (
            <div key={f.q}>
              <dt className="text-white font-medium">{f.q}</dt>
              <dd className="mt-1 text-white/70 leading-relaxed">{f.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function SeoBullet({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <h3 className="text-white font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm text-white/70 leading-relaxed">{children}</p>
    </div>
  );
}

function DownloadButton({
  onClick,
  disabled,
  downloading,
  lockedReason,
}: {
  onClick: () => void;
  disabled: boolean;
  downloading: boolean;
  /** When provided, the button visually shows a lock and a sign-up tooltip. */
  lockedReason?: string;
}) {
  const locked = !!lockedReason;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={lockedReason || 'Downloads a ZIP with the resume and cover letter as both PDF and DOCX'}
      aria-label={lockedReason || 'Download .zip'}
      className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition shadow ${
        locked
          ? 'bg-white/5 border border-white/10 text-white/40 cursor-not-allowed'
          : 'bg-gradient-to-r from-amber-400 via-fuchsia-500 to-indigo-500 text-slate-950 hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed'
      }`}
    >
      {locked ? (
        <>
          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
            <path
              fillRule="evenodd"
              d="M10 1a4 4 0 00-4 4v3H5a2 2 0 00-2 2v7a2 2 0 002 2h10a2 2 0 002-2v-7a2 2 0 00-2-2h-1V5a4 4 0 00-4-4zm2 7V5a2 2 0 10-4 0v3h4z"
              clipRule="evenodd"
            />
          </svg>
          Download (sign up)
        </>
      ) : downloading ? (
        <>
          <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.3" strokeWidth="4" />
            <path d="M22 12a10 10 0 01-10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          </svg>
          Preparing…
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M10 3v10m0 0l-3.5-3.5M10 13l3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Download .zip
        </>
      )}
    </button>
  );
}

/**
 * Wraps the preview with a CSS blur + a sign-up CTA overlay when locked.
 * The blurred content is still rendered to the DOM (so users see it's
 * "real") but is unreadable — and pointer events on it are blocked so
 * inner buttons (Copy, etc.) can't be clicked through the overlay.
 */
function BlurGate({ locked, children }: { locked: boolean; children: React.ReactNode }) {
  if (!locked) return <>{children}</>;
  return (
    <div className="relative">
      <div
        aria-hidden
        className="select-none pointer-events-none"
        style={{ filter: 'blur(7px)', WebkitFilter: 'blur(7px)' }}
      >
        {children}
      </div>
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px] grid place-items-center p-4">
        <div className="text-center max-w-sm rounded-2xl border border-white/10 bg-slate-950/70 backdrop-blur-xl p-6 shadow-2xl">
          <div className="mx-auto h-11 w-11 rounded-full bg-gradient-to-br from-amber-400 via-fuchsia-500 to-indigo-500 grid place-items-center text-slate-950 shadow-lg shadow-fuchsia-500/30 mb-3">
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <path
                fillRule="evenodd"
                d="M10 1a4 4 0 00-4 4v3H5a2 2 0 00-2 2v7a2 2 0 002 2h10a2 2 0 002-2v-7a2 2 0 00-2-2h-1V5a4 4 0 00-4-4zm2 7V5a2 2 0 10-4 0v3h4z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-white">Sign up free to view & download</h3>
          <p className="mt-1.5 text-sm text-white/70 leading-relaxed">
            Your optimized resume + tailored cover letter are ready. Create a free
            account in 10 seconds to unlock the preview and download the PDFs — no
            card required.
          </p>
          <div className="mt-4 flex flex-col sm:flex-row gap-2 justify-center">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-gradient-to-r from-amber-400 via-fuchsia-500 to-indigo-500 text-slate-950 text-sm font-semibold hover:opacity-90 transition shadow-lg shadow-fuchsia-500/30"
            >
              Sign up free
            </Link>
            <Link
              href="/signin"
              className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm font-medium hover:bg-white/10 transition"
            >
              I have an account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function RemainingBanner({ remaining, limit }: { remaining: number; limit: number }) {
  return (
    <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/5 text-emerald-100/90 px-4 py-3 text-sm flex items-center justify-between gap-3 flex-wrap">
      <span>
        <span className="font-semibold text-white">{remaining}</span> of {limit} free
        generations remaining this period.
      </span>
      <Link
        href="/pricing"
        className="text-xs font-semibold text-emerald-200 hover:text-white underline-offset-2 hover:underline"
      >
        Go Pro for unlimited →
      </Link>
    </div>
  );
}

function UpgradePromo({ limit }: { limit: number }) {
  return (
    <div className="relative">
      <div className="absolute -inset-1 rounded-3xl bg-gradient-to-br from-amber-400/30 via-fuchsia-500/30 to-indigo-500/30 blur-2xl opacity-70 pointer-events-none" />
      <div className="relative rounded-3xl border border-amber-400/30 bg-slate-950/70 backdrop-blur-xl p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="hidden sm:grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 via-fuchsia-500 to-indigo-500 text-slate-950 font-bold shadow-lg shadow-fuchsia-500/30 flex-shrink-0">
            ★
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg sm:text-xl font-bold text-white">
              You&apos;ve used all {limit} free generations
            </h2>
            <p className="mt-1.5 text-sm text-white/70 leading-relaxed">
              Generate is paused on your account. Upgrade to Pro for{' '}
              <span className="font-semibold text-amber-200">unlimited</span> tailored
              resumes &amp; cover letters — pay once a month in crypto, no card on file,
              no auto-renew.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-gradient-to-r from-amber-400 via-fuchsia-500 to-indigo-500 text-slate-950 text-sm font-semibold hover:opacity-90 transition shadow-lg shadow-fuchsia-500/30"
              >
                Upgrade — $4.99 / month
              </Link>
              <Link
                href="/account"
                className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm font-medium hover:bg-white/10 transition"
              >
                View account
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InputStatsCard({ stats }: { stats: InputStats }) {
  const totalTokens = stats.jdTokens + stats.resumeTokens;
  // Mirror the lib/llm.ts budget so the user sees the same number the
  // server uses to decide if a request fits.
  const SOFT_CAP = 8300; // TPM 12000 − 1200 safety − 2500 for output
  const pct = Math.min(100, Math.round((totalTokens / SOFT_CAP) * 100));
  const exceeded = totalTokens > SOFT_CAP;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-white">Input size</h3>
        <span className={`text-xs ${exceeded ? 'text-rose-300' : 'text-white/50'}`}>
          {totalTokens} / {SOFT_CAP} tokens used
        </span>
      </div>
      <div className="mt-3 grid sm:grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
          <div className="text-white/40 uppercase tracking-widest text-[10px]">Job description</div>
          <div className="mt-1 text-white/80">
            <span className="font-semibold text-white">{stats.jdWords}</span> words ·{' '}
            <span className="font-semibold text-white">~{stats.jdTokens}</span> tokens
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
          <div className="text-white/40 uppercase tracking-widest text-[10px]">Resume</div>
          <div className="mt-1 text-white/80">
            <span className="font-semibold text-white">{stats.resumeWords}</span> words ·{' '}
            <span className="font-semibold text-white">~{stats.resumeTokens}</span> tokens
          </div>
        </div>
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div
          className={`h-full ${
            exceeded
              ? 'bg-rose-400'
              : pct > 80
              ? 'bg-amber-400'
              : 'bg-gradient-to-r from-fuchsia-500 via-indigo-500 to-sky-400'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {exceeded && (
        <p className="mt-2 text-[11px] text-rose-300/90 leading-snug">
          Over the free-tier budget by ~{totalTokens - SOFT_CAP} tokens. Why: combined inputs
          leave too little room for the model&apos;s response. Shorten the longer one
          (~{Math.ceil((totalTokens - SOFT_CAP) * 0.75)} fewer words) and retry.
        </p>
      )}
    </div>
  );
}

function PaywallCard({
  signedIn,
  freeLimit,
}: {
  signedIn: boolean;
  freeLimit: number;
}) {
  const headline = signedIn
    ? `You've used your ${freeLimit} free generations`
    : 'Sign up to unlock the optimized result';
  const sub = signedIn
    ? 'Upgrade to Pro for unlimited generations, downloads, copy and preview — $4.99/month, paid in crypto.'
    : 'Anonymous users see only the ATS score. Create a free account to preview, copy, and download the rewritten resume + cover letter (3 generations / month).';
  const ctaHref = signedIn ? '/pricing' : '/signup';
  const ctaLabel = signedIn ? 'Upgrade to Pro' : 'Sign up free';
  const secondaryHref = signedIn ? null : '/signin';

  return (
    <div className="relative">
      <div className="absolute -inset-1 rounded-3xl bg-gradient-to-br from-amber-400/30 via-fuchsia-500/30 to-indigo-500/30 blur-2xl opacity-70 pointer-events-none" />
      <div className="relative rounded-3xl border border-white/10 bg-slate-950/70 backdrop-blur-xl p-7 sm:p-9 text-center overflow-hidden">
        <div className="mx-auto h-12 w-12 rounded-full bg-gradient-to-br from-amber-400 via-fuchsia-500 to-indigo-500 grid place-items-center shadow-lg shadow-fuchsia-500/30 mb-4">
          <svg className="w-5 h-5 text-slate-950" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M10 1a4 4 0 00-4 4v3H5a2 2 0 00-2 2v7a2 2 0 002 2h10a2 2 0 002-2v-7a2 2 0 00-2-2h-1V5a4 4 0 00-4-4zm2 7V5a2 2 0 10-4 0v3h4z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <h3 className="text-xl sm:text-2xl font-bold text-white">{headline}</h3>
        <p className="mt-2 text-sm text-white/60 max-w-md mx-auto">{sub}</p>

        <ul className="mt-6 grid sm:grid-cols-2 gap-2 max-w-md mx-auto text-left text-sm text-white/70">
          <PaywallBullet locked={false}>ATS score (visible)</PaywallBullet>
          <PaywallBullet locked={false}>Matched / missing keywords</PaywallBullet>
          <PaywallBullet locked>Optimized resume preview</PaywallBullet>
          <PaywallBullet locked>Tailored cover letter</PaywallBullet>
          <PaywallBullet locked>Copy + Download (PDF / ZIP)</PaywallBullet>
          {signedIn ? (
            <PaywallBullet locked>Unlimited generations</PaywallBullet>
          ) : (
            <PaywallBullet locked>3 generations / month</PaywallBullet>
          )}
        </ul>

        <div className="mt-7 flex flex-col sm:flex-row gap-2 justify-center">
          <Link
            href={ctaHref}
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-gradient-to-r from-amber-400 via-fuchsia-500 to-indigo-500 text-slate-950 font-semibold hover:opacity-90 transition shadow-lg shadow-fuchsia-500/30"
          >
            {ctaLabel}
          </Link>
          {secondaryHref && (
            <Link
              href={secondaryHref}
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white font-medium hover:bg-white/10 transition"
            >
              I already have an account
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function PaywallBullet({ children, locked }: { children: React.ReactNode; locked: boolean }) {
  return (
    <li className={`flex items-start gap-2 ${locked ? 'text-white/50' : 'text-white/85'}`}>
      {locked ? (
        <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-white/40" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M10 1a4 4 0 00-4 4v3H5a2 2 0 00-2 2v7a2 2 0 002 2h10a2 2 0 002-2v-7a2 2 0 00-2-2h-1V5a4 4 0 00-4-4zm2 7V5a2 2 0 10-4 0v3h4z"
            clipRule="evenodd"
          />
        </svg>
      ) : (
        <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 011.42-1.42l2.79 2.79 6.79-6.79a1 1 0 011.42 0z" clipRule="evenodd" />
        </svg>
      )}
      <span>{children}</span>
    </li>
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
