'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CHAIN_LABEL, PRO_TIERS, coerceBillingPeriod, type Chain, type BillingPeriod } from '@/lib/pricing';

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="px-6 py-20 text-center text-white/60 text-sm">Loading…</div>}>
      <CheckoutInner />
    </Suspense>
  );
}

interface Invoice {
  chain: Chain;
  chainLabel: string;
  address: string;
  amount: number;
  currency: string;
  orderCode: string;
  plan: string;
  period: BillingPeriod;
  periodLabel: string;
  periodDays: number;
  savingsPct: number;
  notes: string;
}

const CHAIN_OPTIONS: Chain[] = ['USDT_TRC20', 'USDT_ERC20'];

function CheckoutInner() {
  const router = useRouter();
  const search = useSearchParams();
  const plan = search.get('plan') || 'pro';
  const initialPeriod = coerceBillingPeriod(search.get('period'));
  const [period, setPeriod] = useState<BillingPeriod>(initialPeriod);
  const [chain, setChain] = useState<Chain>('USDT_TRC20');

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  // `loading` = no invoice yet, render the "Creating invoice…" skeleton.
  // `refreshing` = we already have an invoice and are fetching new
  //   numbers in the background; keep the existing card mounted and just
  //   swap values on success. Subtle indicator only.
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [txHash, setTxHash] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [copied, setCopied] = useState<'address' | 'amount' | null>(null);

  // Re-fetch the invoice whenever the user changes period or chain. The
  // card is intentionally NOT unmounted between fetches — that produced a
  // jarring "Creating invoice…" flash every time the user toggled a
  // radio button. Instead we keep the previous invoice rendered while
  // the new one loads and swap the values atomically on success.
  useEffect(() => {
    let cancelled = false;
    // hadInvoice captures whether we're doing an initial load (no card
    // to keep visible) or a refresh (existing card stays). useState is
    // async so reading `invoice` here works even during the React
    // commit phase that runs this effect.
    const hadInvoice = invoice !== null;
    if (hadInvoice) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    (async () => {
      try {
        const res = await fetch('/api/checkout/crypto', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan, period, chain }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          if (res.status === 401) {
            router.push(
              `/signin?next=${encodeURIComponent(`/checkout?plan=${plan}&period=${period}`)}`
            );
            return;
          }
          throw new Error(data.error || 'Failed to create invoice');
        }
        setInvoice(data);
      } catch (e: any) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // We intentionally exclude `invoice` from the dep list — including
    // it would cause the effect to re-fire on every successful fetch
    // (since setInvoice changes it), creating an infinite refresh loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, period, chain, router]);

  const verify = async () => {
    if (!invoice) return;
    setVerifying(true);
    setVerifyError(null);
    try {
      const res = await fetch('/api/checkout/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan,
          period,
          chain,
          txHash: txHash.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed');
      setSuccess(true);
      setTimeout(() => router.push('/account'), 1500);
    } catch (e: any) {
      setVerifyError(e.message);
    } finally {
      setVerifying(false);
    }
  };

  const copy = (val: string, kind: 'address' | 'amount') => {
    navigator.clipboard.writeText(val).then(() => {
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
      <header className="text-center mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-[1.15] pb-1 bg-gradient-to-r from-amber-200 via-fuchsia-300 to-sky-200 bg-clip-text text-transparent">
          Pay with crypto
        </h1>
        <p className="mt-2 text-white/60 text-sm">
          Pay with USDT — TRC-20 (Tron) or ERC-20 (Ethereum). Pro is unlocked the
          moment we verify your transaction on-chain.
        </p>
      </header>

      <div className="relative">
        <div className="absolute -inset-1 rounded-3xl bg-gradient-to-br from-amber-400/30 via-fuchsia-500/30 to-indigo-500/20 blur-2xl opacity-70" />
        <div className="relative rounded-3xl bg-slate-950/70 backdrop-blur-xl border border-white/10 p-7 shadow-2xl">
          {!success && (
            <>
              <PeriodPicker value={period} onChange={setPeriod} disabled={verifying} />
              <ChainPicker value={chain} onChange={setChain} disabled={verifying} />
            </>
          )}

          {loading && !invoice && (
            <p className="mt-5 text-white/60 text-sm">Creating invoice…</p>
          )}
          {error && (
            <div className="mt-5 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-4">
              {error}
              {error.toLowerCase().includes('not configured') && (
                <p className="mt-2 text-xs text-rose-200/80">
                  Set <code className="px-1 rounded bg-black/30">OWNER_USDT_TRC20_ADDRESS</code> and/or{' '}
                  <code className="px-1 rounded bg-black/30">OWNER_USDT_ERC20_ADDRESS</code> in{' '}
                  <code className="px-1 rounded bg-black/30">.env.local</code> to enable crypto payments.
                </p>
              )}
            </div>
          )}

          {invoice && !success && (
            <div className="mt-5 space-y-5">
              <div className="flex justify-between items-baseline">
                <div>
                  <div className="text-xs uppercase tracking-widest text-white/40">Plan</div>
                  <div className="text-lg font-semibold text-white">
                    Pro · {invoice.periodLabel}
                    {invoice.savingsPct > 0 && (
                      <span className="ml-2 text-xs font-bold text-emerald-300">
                        −{invoice.savingsPct}%
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase tracking-widest text-white/40 inline-flex items-center gap-1.5 justify-end">
                    Order
                    {refreshing && (
                      <svg
                        className="animate-spin h-3 w-3 text-white/50"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-label="Updating amount"
                      >
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.3" strokeWidth="4" />
                        <path d="M22 12a10 10 0 01-10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                      </svg>
                    )}
                  </div>
                  <div className="text-lg font-mono text-amber-300">{invoice.orderCode}</div>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Network" value={invoice.chainLabel} />
                <Field
                  label={`Amount (${invoice.currency})`}
                  value={invoice.amount.toString()}
                  onCopy={() => copy(invoice.amount.toString(), 'amount')}
                  copied={copied === 'amount'}
                />
              </div>

              <Field
                label="Send to this address"
                value={invoice.address}
                onCopy={() => copy(invoice.address, 'address')}
                copied={copied === 'address'}
                mono
              />

              <div className="rounded-xl bg-amber-400/10 border border-amber-400/30 p-3.5 text-xs text-amber-100">
                ⚠ Send the <span className="font-semibold">exact amount</span> on the{' '}
                <span className="font-semibold">{invoice.chainLabel}</span> network only.
                Other networks won't be detected — funds sent on the wrong chain may be
                unrecoverable.
              </div>

              <div>
                <label className="block text-xs font-medium text-white/70 mb-1.5">
                  After paying, paste your transaction hash
                </label>
                <input
                  value={txHash}
                  onChange={(e) => setTxHash(e.target.value.trim())}
                  placeholder={
                    chain === 'USDT_TRC20' ? '64 hex characters' : '0x… 66 characters total'
                  }
                  className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-400/30 outline-none transition font-mono text-sm"
                />
                <p className="mt-1 text-xs text-white/40">
                  {chain === 'USDT_TRC20' ? (
                    <>
                      TRC-20 tx hashes are 64 hex characters with no <code>0x</code> prefix.
                      Find yours in your wallet&apos;s transaction details or on{' '}
                      tronscan.org.
                    </>
                  ) : (
                    <>
                      ERC-20 tx hashes start with <code>0x</code> followed by 64 hex
                      characters. Find yours in your wallet&apos;s transaction details or on{' '}
                      etherscan.io.
                    </>
                  )}
                </p>
                {verifyError && (
                  <div className="mt-2 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-3">
                    {verifyError}
                  </div>
                )}
                <button
                  onClick={verify}
                  disabled={
                    verifying ||
                    (chain === 'USDT_TRC20'
                      ? !/^[0-9a-fA-F]{64}$/.test(txHash)
                      : !/^(0x)?[0-9a-fA-F]{64}$/.test(txHash))
                  }
                  className="mt-3 w-full py-2.5 rounded-lg bg-gradient-to-r from-amber-400 via-fuchsia-500 to-indigo-500 text-slate-950 font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg shadow-fuchsia-500/30"
                >
                  {verifying ? 'Verifying…' : 'Verify payment'}
                </button>
              </div>

              <p className="text-xs text-white/40 text-center">
                Verification typically takes a few seconds after on-chain confirmation
                ({chain === 'USDT_TRC20' ? '~1 min on Tron' : '~3 min on Ethereum'}).
              </p>
            </div>
          )}

          {success && (
            <div className="text-center py-6">
              <div className="text-5xl mb-3">🎉</div>
              <h2 className="text-2xl font-bold text-white">Payment verified</h2>
              <p className="mt-2 text-white/60 text-sm">You're upgraded to Pro. Redirecting…</p>
            </div>
          )}
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-white/40">
        <Link href="/pricing" className="hover:text-white">
          ← Back to pricing
        </Link>
      </p>
    </main>
  );
}

function PeriodPicker({
  value,
  onChange,
  disabled,
}: {
  value: BillingPeriod;
  onChange: (p: BillingPeriod) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-white/40 mb-2">Billing period</div>
      <div role="radiogroup" className="grid grid-cols-3 gap-2">
        {PRO_TIERS.map((t) => {
          const isSelected = t.period === value;
          return (
            <button
              key={t.period}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={disabled}
              onClick={() => onChange(t.period)}
              className={`rounded-xl border px-2.5 py-2 transition text-left disabled:opacity-50 disabled:cursor-not-allowed ${
                isSelected
                  ? 'border-fuchsia-400/60 bg-fuchsia-500/10 ring-2 ring-fuchsia-400/30'
                  : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
              }`}
            >
              <div className="text-[11px] font-semibold text-white">{t.label}</div>
              <div className="mt-0.5 text-sm font-bold text-white">${t.priceUSD}</div>
              {t.savingsPct > 0 && (
                <div className="text-[10px] font-semibold text-emerald-300">
                  −{t.savingsPct}%
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ChainPicker({
  value,
  onChange,
  disabled,
}: {
  value: Chain;
  onChange: (c: Chain) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-4">
      <div className="text-xs uppercase tracking-widest text-white/40 mb-2">Network</div>
      <div role="radiogroup" className="grid grid-cols-2 gap-2">
        {CHAIN_OPTIONS.map((c) => {
          const isSelected = c === value;
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={disabled}
              onClick={() => onChange(c)}
              className={`rounded-xl border px-3 py-2 transition text-left disabled:opacity-50 disabled:cursor-not-allowed ${
                isSelected
                  ? 'border-sky-400/60 bg-sky-500/10 ring-2 ring-sky-400/30'
                  : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
              }`}
            >
              <div className="text-sm font-semibold text-white">{CHAIN_LABEL[c]}</div>
              <div className="mt-0.5 text-[11px] text-white/50">
                {c === 'USDT_TRC20' ? 'Low fees · ~1 min confirms' : 'Universal · ~3 min confirms'}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onCopy,
  copied,
  mono,
}: {
  label: string;
  value: string;
  onCopy?: () => void;
  copied?: boolean;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-white/40 mb-1.5">{label}</div>
      <div className="flex items-center gap-2">
        <div
          className={`flex-1 px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white ${
            mono ? 'font-mono text-xs break-all' : 'text-sm'
          }`}
        >
          {value}
        </div>
        {onCopy && (
          <button
            onClick={onCopy}
            className="px-3 py-2.5 text-xs font-medium text-white/80 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition"
          >
            {copied ? '✓' : 'Copy'}
          </button>
        )}
      </div>
    </div>
  );
}
