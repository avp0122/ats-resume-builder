'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface ResumeSettingsProps {
  initialFilename: string | null;
  initialUploadedAt: string | null;
}

/**
 * Resume upload/replace/delete widget on the /account page. Holds the
 * "single resume per profile" UX:
 *   - If a resume is already on file: show its filename + upload date,
 *     plus "Replace" (file input) and "Remove" buttons.
 *   - Otherwise: show only the upload control with explanatory copy.
 *
 * Uses `router.refresh()` after every mutation so the server-rendered
 * /account page re-fetches the profile and displays the new state
 * without a full reload.
 */
export default function ResumeSettings({
  initialFilename,
  initialUploadedAt,
}: ResumeSettingsProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [filename, setFilename] = useState<string | null>(initialFilename);
  const [uploadedAt, setUploadedAt] = useState<string | null>(initialUploadedAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File) => {
      setError(null);
      const lowerName = file.name.toLowerCase();
      const looksLikeResume = lowerName.endsWith('.pdf') || lowerName.endsWith('.docx');
      if (!looksLikeResume) {
        setError('Resume must be a PDF or DOCX file.');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError('Resume file is too large. Max 10MB.');
        return;
      }
      setBusy(true);
      try {
        const form = new FormData();
        form.append('resume', file);
        const res = await fetch('/api/profile/resume', { method: 'POST', body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error || 'Upload failed.');
        }
        setFilename(data.filename || file.name);
        setUploadedAt(data.uploaded_at || new Date().toISOString());
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed.');
      } finally {
        setBusy(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [router]
  );

  const remove = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/profile/resume', { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Could not remove resume.');
      setFilename(null);
      setUploadedAt(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove resume.');
    } finally {
      setBusy(false);
    }
  }, [router]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void upload(file);
  };

  const formattedDate = uploadedAt
    ? new Date(uploadedAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <section className="mt-6 rounded-3xl border border-white/10 bg-slate-950/60 backdrop-blur-xl p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Your resume</h2>
          <p className="mt-1 text-sm text-white/60">
            We use this every time you generate. Update it whenever your career changes —
            new role, new title, new project worth shouting about.
          </p>
        </div>
        <span
          className={`shrink-0 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
            filename
              ? 'bg-emerald-400/15 text-emerald-300 border border-emerald-400/30'
              : 'bg-amber-400/15 text-amber-300 border border-amber-400/30'
          }`}
        >
          {filename ? 'On file' : 'Not uploaded'}
        </span>
      </div>

      {filename ? (
        <div className="mt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-widest text-white/40">Current file</div>
            <div className="mt-1 text-white font-medium truncate">{filename}</div>
            {formattedDate && (
              <div className="mt-0.5 text-xs text-white/40">Uploaded {formattedDate}</div>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 rounded-md bg-white text-slate-950 text-sm font-medium hover:bg-white/90 transition disabled:opacity-50"
            >
              {busy ? 'Uploading…' : 'Replace'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className="px-3 py-1.5 rounded-md bg-white/10 text-white text-sm hover:bg-white/15 transition disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-5">
          <label
            className={`flex flex-col items-center justify-center gap-2 px-6 py-8 rounded-xl border-2 border-dashed transition cursor-pointer ${
              busy
                ? 'border-fuchsia-400/50 bg-fuchsia-400/5'
                : 'border-white/15 hover:border-white/30 hover:bg-white/[0.02]'
            }`}
          >
            <span className="text-white font-medium">
              {busy ? 'Uploading…' : 'Upload your resume (PDF or DOCX)'}
            </span>
            <span className="text-xs text-white/50">Max 10MB · Stored as text only</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              disabled={busy}
              onChange={onFileChange}
            />
          </label>
        </div>
      )}

      {/* Hidden replace input — separate from the visible one in the empty
          state so its `ref` is always present for the Replace button. */}
      {filename && (
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          disabled={busy}
          onChange={onFileChange}
        />
      )}

      {error && (
        <p className="mt-3 text-sm text-red-300">
          {error}
        </p>
      )}

      <p className="mt-4 text-xs text-white/40">
        Only the extracted text is stored — the original file is dropped after upload.
        Click <em>Remove</em> to clear it from our database.
      </p>
    </section>
  );
}
