'use client';

import { FormEvent, useState } from 'react';

const MIN_SUBJECT = 3;
const MIN_MESSAGE = 10;
const MAX_MESSAGE = 5000;

export default function SupportForm({ signedInEmail }: { signedInEmail: string | null }) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  // Anonymous users can optionally leave an email so we can reply. Signed-in
  // users don't see this field — we already know their email.
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ ticketId: string } | null>(null);

  const canSubmit =
    subject.trim().length >= MIN_SUBJECT &&
    message.trim().length >= MIN_MESSAGE &&
    message.trim().length <= MAX_MESSAGE &&
    !submitting;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
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
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit support request');
      setSuccess({ ticketId: data.ticketId });
      setSubject('');
      setMessage('');
      setEmail('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="rounded-3xl border border-emerald-400/30 bg-emerald-500/5 backdrop-blur-md p-8 text-center">
        <div className="mx-auto h-12 w-12 rounded-full bg-emerald-400/20 grid place-items-center text-2xl mb-3">
          ✓
        </div>
        <h2 className="text-xl font-bold text-white">Thanks — we got your note</h2>
        <p className="mt-2 text-sm text-white/70">
          Ticket{' '}
          <span className="font-mono text-emerald-200">
            {success.ticketId.slice(0, 8)}
          </span>{' '}
          received. We&apos;ll get back to you{' '}
          {signedInEmail ? 'at your account email' : 'at the email you provided'} as
          soon as we can.
        </p>
        <button
          onClick={() => setSuccess(null)}
          className="mt-5 inline-flex items-center justify-center px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm font-medium hover:bg-white/10 transition"
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute -inset-1 rounded-3xl bg-gradient-to-br from-fuchsia-500/20 via-indigo-500/20 to-sky-400/20 blur-2xl" />
      <form
        onSubmit={submit}
        className="relative rounded-3xl bg-slate-950/60 backdrop-blur-xl border border-white/10 p-6 sm:p-8 space-y-5"
      >
        <div>
          <label className="block text-xs font-medium text-white/70 mb-1.5">Subject</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
            required
            placeholder="Short summary of the issue"
            className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-400/30 outline-none transition"
          />
        </div>

        {!signedInEmail && (
          <div>
            <label className="block text-xs font-medium text-white/70 mb-1.5">
              Your email <span className="text-white/40">(optional — required for a reply)</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-400/30 outline-none transition"
            />
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-medium text-white/70">Message</label>
            <span className="text-[11px] text-white/40">
              {message.trim().length} / {MAX_MESSAGE}
            </span>
          </div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={8}
            maxLength={MAX_MESSAGE}
            required
            placeholder="Tell us what happened. Include steps, screenshots links, and what you expected to happen."
            className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-400/30 outline-none transition resize-y leading-relaxed text-sm"
          />
        </div>

        {error && (
          <div className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-3">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-white/40">
            {signedInEmail ? (
              <>
                Signed in as <span className="text-white/70">{signedInEmail}</span>
              </>
            ) : (
              'Sending anonymously — leave an email above if you want a reply.'
            )}
          </p>
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-fuchsia-500 via-indigo-500 to-sky-400 text-white font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-lg shadow-fuchsia-500/30 text-sm"
          >
            {submitting ? 'Sending…' : 'Send to support'}
          </button>
        </div>
      </form>
    </div>
  );
}
