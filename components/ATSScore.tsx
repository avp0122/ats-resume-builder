'use client';

import { useEffect, useState } from 'react';

interface ATSScoreProps {
  originalScore: number;
  score: number;
  matched: string[];
  missing: string[];
}

export default function ATSScore({ originalScore, score, matched, missing }: ATSScoreProps) {
  const animatedOriginal = useAnimatedNumber(originalScore);
  const animatedNew = useAnimatedNumber(score);
  const delta = score - originalScore;
  const label =
    score >= 85 ? 'Excellent match' : score >= 70 ? 'Strong match' : score >= 50 ? 'Decent match' : 'Needs improvement';

  return (
    <div className="relative rounded-3xl border border-white/10 bg-slate-900/60 backdrop-blur-xl p-6 md:p-8 overflow-hidden">
      <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-fuchsia-500/20 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-sky-400/20 blur-3xl pointer-events-none" />

      <div className="relative">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-xl font-semibold text-white">{label}</h3>
            <p className="mt-0.5 text-sm text-white/60">
              How well your resume matches the job description.
            </p>
          </div>
          {delta !== 0 && (
            <div
              className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold ${
                delta > 0
                  ? 'bg-emerald-500/15 border border-emerald-400/40 text-emerald-300'
                  : 'bg-rose-500/15 border border-rose-400/40 text-rose-300'
              }`}
            >
              {delta > 0 ? '↑' : '↓'} {Math.abs(delta)} pts
            </div>
          )}
        </div>

        {/* Compare bars */}
        <div className="grid sm:grid-cols-2 gap-4">
          <ScoreBar
            label="Original resume"
            value={animatedOriginal}
            tone="muted"
          />
          <ScoreBar
            label="Optimized resume"
            value={animatedNew}
            tone="vibrant"
            highlight
          />
        </div>

        {delta !== 0 && (
          <div className="sm:hidden mt-3 text-center">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold ${
                delta > 0
                  ? 'bg-emerald-500/15 border border-emerald-400/40 text-emerald-300'
                  : 'bg-rose-500/15 border border-rose-400/40 text-rose-300'
              }`}
            >
              {delta > 0 ? '↑' : '↓'} {Math.abs(delta)} pts
            </span>
          </div>
        )}

        <div className="mt-6 grid sm:grid-cols-2 gap-4">
          <KeywordList title="Matched" items={matched} tone="emerald" emptyText="No matches detected" />
          <KeywordList title="Missing" items={missing} tone="rose" emptyText="Nothing important missing" />
        </div>
      </div>
    </div>
  );
}

function useAnimatedNumber(target: number): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const clamped = Math.max(0, Math.min(100, target));
    let raf = 0;
    const start = performance.now();
    const duration = 900;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(eased * clamped));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return value;
}

function ScoreBar({
  label,
  value,
  tone,
  highlight,
}: {
  label: string;
  value: number;
  tone: 'muted' | 'vibrant';
  highlight?: boolean;
}) {
  const fillBg =
    tone === 'vibrant'
      ? 'bg-gradient-to-r from-sky-400 via-fuchsia-500 to-amber-400'
      : 'bg-white/30';
  const numberClr =
    tone === 'vibrant'
      ? 'bg-gradient-to-r from-sky-300 via-fuchsia-300 to-amber-300 bg-clip-text text-transparent'
      : 'text-white/70';

  return (
    <div
      className={`rounded-2xl border p-4 ${
        highlight ? 'border-fuchsia-400/40 bg-white/[0.04]' : 'border-white/10 bg-white/[0.02]'
      }`}
    >
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs uppercase tracking-widest text-white/50">{label}</span>
        <span className={`text-3xl font-bold tabular-nums ${numberClr}`}>{value}</span>
      </div>
      <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full ${fillBg} rounded-full`}
          style={{ width: `${value}%`, transition: 'width 200ms linear' }}
        />
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
