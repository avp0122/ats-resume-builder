'use client';

import { useChat } from 'ai/react';
import { useEffect, useRef, useState } from 'react';
import { SupportPopup, type SessionEcho } from './SupportWidget';

/**
 * Floating chat assistant (bottom-right). Replaces the old standalone
 * Support launcher button (DECISION 031, PR 3). Streams answers from
 * /api/chat (RAG-grounded Groq Llama 3.3 70B). A "Talk to a human" link
 * inside the panel opens the existing support form (SupportPopup).
 */

const GREETING =
  "Hi! I'm the kairesume assistant. Ask me about resumes, ATS scoring, pricing, payments, or anything about the product. For account-specific issues, use “Talk to a human” below.";

/** Pull a clean message out of useChat's error (the body of a non-200). */
function friendlyError(error: Error | undefined): string | null {
  if (!error) return null;
  try {
    const parsed = JSON.parse(error.message);
    if (parsed && typeof parsed.error === 'string') return parsed.error;
  } catch {
    /* not JSON — fall through */
  }
  return 'Something went wrong. Please try again, or use “Talk to a human” below.';
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [session, setSession] = useState<SessionEcho>({ signedInEmail: null });

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    error,
  } = useChat({
    api: '/api/chat',
    initialMessages: [{ id: 'greeting', role: 'assistant', content: GREETING }],
  });

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Light identity fetch for the support-form email prefill (same endpoint
  // the old SupportWidget used).
  useEffect(() => {
    let cancelled = false;
    fetch('/api/usage', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (data.signedIn && typeof data.email === 'string') {
          setSession({ signedInEmail: data.email });
        }
      })
      .catch(() => {
        /* non-fatal */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the transcript pinned to the latest message.
  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open, isLoading]);

  // Focus the input when the panel opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Esc closes the panel (but not while the support modal is on top of it).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showSupport) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, showSupport]);

  const errMsg = friendlyError(error);

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open chat assistant"
          title="Chat with the kairesume assistant"
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 px-4 py-3 rounded-full bg-gradient-to-r from-fuchsia-500 via-indigo-500 to-sky-400 text-white font-semibold shadow-lg shadow-fuchsia-500/30 hover:opacity-95 transition"
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
            <path d="M2 4.5A2.5 2.5 0 014.5 2h11A2.5 2.5 0 0118 4.5v8A2.5 2.5 0 0115.5 15H10l-4 3v-3H4.5A2.5 2.5 0 012 12.5v-8z" />
          </svg>
          <span className="hidden sm:inline text-sm">Ask kairesume</span>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-end sm:justify-end p-0 sm:p-6 pointer-events-none">
          <div
            role="dialog"
            aria-modal="false"
            aria-labelledby="chat-title"
            className="pointer-events-auto flex h-[100dvh] w-full flex-col border border-white/10 bg-slate-950/95 backdrop-blur-xl shadow-2xl shadow-fuchsia-500/20 sm:h-[min(620px,80vh)] sm:max-w-md sm:rounded-3xl"
          >
            {/* Header */}
            <header className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-r from-fuchsia-500 via-indigo-500 to-sky-400 text-white">
                  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                    <path d="M2 4.5A2.5 2.5 0 014.5 2h11A2.5 2.5 0 0118 4.5v8A2.5 2.5 0 0115.5 15H10l-4 3v-3H4.5A2.5 2.5 0 012 12.5v-8z" />
                  </svg>
                </span>
                <div className="min-w-0">
                  <h2 id="chat-title" className="truncate text-sm font-bold text-white">
                    kairesume assistant
                  </h2>
                  <p className="truncate text-[11px] text-white/50">
                    Resume help, pricing & support
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden>
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </header>

            {/* Transcript */}
            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
                >
                  <div
                    className={
                      m.role === 'user'
                        ? 'max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-gradient-to-r from-fuchsia-500/90 to-indigo-500/90 px-3.5 py-2 text-sm text-white'
                        : 'max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm border border-white/10 bg-white/5 px-3.5 py-2 text-sm leading-relaxed text-white/90'
                    }
                  >
                    {m.content}
                  </div>
                </div>
              ))}

              {isLoading &&
                messages[messages.length - 1]?.role === 'user' && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl rounded-bl-sm border border-white/10 bg-white/5 px-3.5 py-2 text-sm text-white/50">
                      <span className="inline-flex gap-1">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60 [animation-delay:-0.2s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60 [animation-delay:-0.1s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60" />
                      </span>
                    </div>
                  </div>
                )}

              {errMsg && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                  {errMsg}
                </div>
              )}
            </div>

            {/* Composer */}
            <form
              onSubmit={handleSubmit}
              className="border-t border-white/10 px-3 py-3"
            >
              <div className="flex items-end gap-2">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  placeholder="Ask about resumes, pricing, your account…"
                  maxLength={2000}
                  className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-400/30"
                />
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  aria-label="Send message"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-r from-fuchsia-500 via-indigo-500 to-sky-400 text-white shadow-lg shadow-fuchsia-500/30 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
                    <path d="M3.4 2.6a1 1 0 00-1.3 1.2l1.6 5.2L11 10l-7.3 1 -1.6 5.2a1 1 0 001.3 1.2l14-7a1 1 0 000-1.8l-14-7z" />
                  </svg>
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between px-0.5">
                <p className="text-[10px] text-white/30">
                  AI can be wrong — verify important details.
                </p>
                <button
                  type="button"
                  onClick={() => setShowSupport(true)}
                  className="text-[11px] font-medium text-sky-300 underline-offset-2 transition hover:text-sky-200 hover:underline"
                >
                  Talk to a human
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSupport && (
        <SupportPopup onClose={() => setShowSupport(false)} session={session} />
      )}
    </>
  );
}
