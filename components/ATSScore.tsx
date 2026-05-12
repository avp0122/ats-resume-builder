'use client';

import { useEffect, useState } from 'react';

interface ATSScoreProps {
  score: number;
  matched: string[];
  missing: string[];
}

export default function ATSScore({ score, matched, missing }: ATSScoreProps) {
  const [animated, setAnimated] = useState(0);

  useEffect(() => {
    const target = Math.max(0, Math.min(100, score));
    let raf = 0;
    const start = performance.now();
    const duration = 900;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setAnimated(Math.round(eased * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score]);

  const circumference = 2 * Math.PI * 56;
  const offset = circumference - (animated / 100) * circumference;
  const label =
    score >= 85 ? 'Excellent match' : score >= 70 ? 'Strong match' : score >= 50 ? 'Decent match' : 'Needs improvement';
  const tint =
    score >= 85
      ? 'from-emerald-400 to-sky-400'
      : score >= 70
      ? 'from-sky-400 to-indigo-400'
      : score >= 50
      ? 'from-amber-400 to-fuchsia-400'
      : 'from-rose-400 to-fuchsia-400';

  return (
    <div className="relative rounded-3xl border border-white/10 bg-slate-900/60 backdrop-blur-xl p-6 md:p-8 overflow-hidden">
      <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-fuchsia-500/20 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-sky-400/20 blur-3xl pointer-events-none" />

      <div className="relative grid md:grid-cols-[auto_1fr] gap-6 items-center">
        <div className="relative h-36 w-36 mx-auto md:mx-0">
          <svg viewBox="0 0 128 128" className="-rotate-90">
            <defs>
              <linearGradient id="scoreGradient" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#22d3ee" />
                <stop offset="50%" stopColor="#a855f7" />
                <stop offset="100%" stopColor="#f43f5e" />
              </linearGradient>
            </defs>
            <circle cx="64" cy="64" r="56" stroke="rgba(255,255,255,0.08)" strokeWidth="10" fill="none" />
            <circle
              cx="64"
              cy="64"
              r="56"
              stroke="url(#scoreGradient)"
              strokeWidth="10"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 0.2s linear' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-4xl font-bold bg-gradient-to-r ${tint} bg-clip-text text-transparent`}>
              {animated}
            </span>
            <span className="text-[10px] tracking-widest text-white/50 uppercase">ATS score</span>
          </div>
        </div>

        <div>
          <h3 className="text-xl font-semibold text-white">{label}</h3>
          <p className="mt-1 text-sm text-white/60">
            How well the rewritten resume aligns with the job description.
          </p>

          <div className="mt-4 grid sm:grid-cols-2 gap-4">
            <KeywordList title="Matched" items={matched} tone="emerald" emptyText="No matches detected" />
            <KeywordList title="Missing" items={missing} tone="rose" emptyText="Nothing important missing" />
          </div>
        </div>
      </div>
    </div>
  );
}

function KeywordList({
  title,
  items,
  tone,
  emptyText,
}: {
  title: string;
  items: string[];
  tone: 'emerald' | 'rose';
  emptyText: string;
}) {
  const colors =
    tone === 'emerald'
      ? 'bg-emerald-500/10 border-emerald-400/30 text-emerald-200'
      : 'bg-rose-500/10 border-rose-400/30 text-rose-200';
  return (
    <div>
      <h4 className="text-xs font-semibold tracking-widest text-white/50 uppercase mb-2">{title}</h4>
      {items.length === 0 ? (
        <p className="text-xs text-white/40">{emptyText}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((kw, i) => (
            <li
              key={`${kw}-${i}`}
              className={`px-2 py-0.5 rounded-full text-xs font-medium border ${colors}`}
            >
              {kw}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
