'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';

const MIN_SUBJECT = 3;
const MAX_SUBJECT = 200;
const MIN_MESSAGE = 10;
const MAX_MESSAGE = 5000;

interface SessionEcho {
  signedInEmail: string | null;
}

/**
 * Floating support button (bottom-right). Click opens a popup with
 * subject / contact email / phone / message. Visible site-wide.
 *
 * The signed-in user's email is auto-filled when available — we fetch it
 * from /api/usage which already returns identity + plan info.
 */
export default function SupportWidget() {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<SessionEcho>({ signedInEmail: null });

  // Light identity fetch so we can prefill / hide the email input. We
  // piggyback on /api/usage because adding a dedicated /me endpoint just
  // for an email is overkill.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/usage', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        // /api/usage exposes signedIn (boolean) and a profile-derived
        // shape but not email directly. Email comes from /api/support's
        // server-side check anyway; we only need a hint here, so we use
        // `signedIn` to decide whether to render the email field.
        if (data.signedIn) {
          // Best-effort: a second tiny request to /api/me would be cleaner
          // but is overkill. Mark email as "known on server" with a
          // placeholder so the input is omitted from the form.
          setSession({ signedInEmail: 'on-file' });
        }
      })
      .catch(() => {
        /* non-fatal */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Lock body scroll while the popup is open so the page underneath
  // doesn't shift on mobile keyboards.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Esc closes the popup. Keep the handler scoped to when it's open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      {/* Launcher */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open support"
        title="Support — leave a message"
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 px-4 py-3 rounded-full bg-gradient-to-r from-fuchsia-500 via-indigo-500 to-sky-400 text-white font-semibold shadow-lg shadow-fuchsia-500/30 hover:opacity-95 transition"
      >
        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path d="M2 4.5A2.5 2.5 0 014.5 2h11A2.5 2.5 0 0118 4.5v8A2.5 2.5 0 0115.5 15H10l-4 3v-3H4.5A2.5 2.5 0 012 12.5v-8z" />
        </svg>
        <span className="hidden sm:inline text-sm">Support</span>
      </button>

      {open && <SupportPopup onClose={() => setOpen(false)} session={session} />}
    </>
  );
}

function SupportPopup({
  onClose,
  session,
}: {
  onClose: () => void;
  session: SessionEcho;
}) {
  const [subject, setSubject] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ ticketId: string } | null>(null);
  const subjectRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // Autofocus first field on open.
    subjectRef.current?.focus();
  }, []);

  const canSubmit =
    subject.trim().length >= MIN_SUBJECT &&
    subject.trim().length <= MAX_SUBJECT &&
    message.trim().length >= MIN_MESSAGE &&
    message.trim().length <= MAX_MESSAGE &&
    !submitting;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: subject.trim(),
          message: message.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit support request');
      setSuccess({ ticketId: data.ticketId });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-end p-3 sm:p-6 bg-slate-950/60 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-popup-title"
        className="relative w-full sm:max-w-md rounded-3xl border border-white/10 bg-slate-950/90 backdrop-blur-xl shadow-2xl shadow-fuchsia-500/20"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close support"
          className="absolute top-3 right-3 h-8 w-8 rounded-full grid place-items-center text-white/60 hover:text-white hover:bg-white/10 transition"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden>
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        <div className="p-6 sm:p-7">
          <header>
            <h2
              id="support-popup-title"
              className="text-lg font-bold text-white tracking-tight"
            >
              Talk to support
            </h2>
            <p className="mt-1 text-xs text-white/60">
              Free for everyone. Bug reports, billing, feature requests — we read
              every message.
            </p>
          </header>

          {success ? (
            <div className="mt-5 rounded-2xl border border-emerald-400/30 bg-emerald-500/5 p-5 text-center">
              <div className="mx-auto h-10 w-10 rounded-full bg-emerald-400/20 grid place-items-center text-xl mb-2">
                ✓
              </div>
              <p className="text-sm font-semibold text-white">
                Thanks — we got your note
              </p>
              <p className="mt-1 text-xs text-white/70">
                Ticket{' '}
                <span className="font-mono text-emerald-200">
                  {success.ticketId.slice(0, 8)}
                </span>{' '}
                received.{' '}
                {session.signedInEmail
                  ? "We'll reply to your account email."
                  : email.trim()
                  ? `We'll reply to ${email.trim()}.`
                  : "Leave an email next time if you'd like a reply."}
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-4 inline-flex items-center justify-center px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm font-medium hover:bg-white/10 transition"
              >
                Close
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-5 space-y-3.5">
              <Field
                label="Title"
                value={subject}
                onChange={setSubject}
                placeholder="Short summary"
                maxLength={MAX_SUBJECT}
                required
                inputRef={subjectRef}
              />
              {!session.signedInEmail && (
                <Field
                  label="Email"
                  value={email}
                  onChange={setEmail}
                  type="email"
                  placeholder="you@example.com (optional)"
                />
              )}
              <Field
                label="Phone"
                value={phone}
                onChange={setPhone}
                type="tel"
                placeholder="+1 555 0100 (optional)"
              />
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-medium text-white/70 uppercase tracking-wider">
                    Message
                  </label>
                  <span className="text-[10px] text-white/40">
                    {message.trim().length} / {MAX_MESSAGE}
                  </span>
                </div>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  maxLength={MAX_MESSAGE}
                  required
                  placeholder="Tell us what happened, with steps if you can."
                  className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-400/30 outline-none transition resize-y leading-relaxed text-sm"
                />
              </div>

              {error && (
                <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-2.5">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full px-4 py-2.5 rounded-lg bg-gradient-to-r from-fuchsia-500 via-indigo-500 to-sky-400 text-white font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-lg shadow-fuchsia-500/30 text-sm"
              >
                {submitting ? 'Sending…' : 'Send to support'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  maxLength,
  required,
  inputRef,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  maxLength?: number;
  required?: boolean;
  inputRef?: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-white/70 uppercase tracking-wider mb-1">
        {label}
      </label>
      <input
        ref={inputRef}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        required={required}
        className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-400/30 outline-none transition text-sm"
      />
    </div>
  );
}
