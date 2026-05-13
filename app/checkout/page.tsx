'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="px-6 py-20 text-center text-white/60 text-sm">Loading…</div>}>
      <CheckoutInner />
    </Suspense>
  );
}

interface Invoice {
  chain: string;
  chainLabel: string;
  address: string;
  amount: number;
  currency: string;
  orderCode: string;
  plan: string;
  notes: string;
}

function CheckoutInner() {
  const router = useRouter();
  const search = useSearchParams();
  const plan = search.get('plan') || 'pro';

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [txHash, setTxHash] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [copied, setCopied] = useState<'address' | 'amount' | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/checkout/crypto', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 401) {
            router.push(`/signin?next=/checkout?plan=${plan}`);
            return;
          }
          throw new Error(data.error || 'Failed to create invoice');
        }
        setInvoice(data);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [plan, router]);

  const verify = async () => {
    if (!invoice) return;
    setVerifying(true);
    setVerifyError(null);
    try {
      const res = await fetch('/api/checkout/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, txHash: txHash.trim() }),
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
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight bg-gradient-to-r from-amber-200 via-fuchsia-300 to-sky-200 bg-clip-text text-transparent">
          Pay with crypto
        </h1>
        <p className="mt-2 text-white/60 text-sm">
          One-time payment in USDT (BEP-20 / Binance Smart Chain). Pro is unlocked the moment we verify your transaction on-chain.
        </p>
      </header>

      <div className="relative">
        <div className="absolute -inset-1 rounded-3xl bg-gradient-to-br from-amber-400/30 via-fuchsia-500/30 to-indigo-500/20 blur-2xl opacity-70" />
        <div className="relative rounded-3xl bg-slate-950/70 backdrop-blur-xl border border-white/10 p-7 shadow-2xl">
          {loading && <p className="text-white/60 text-sm">Creating invoice…</p>}
          {error && (
            <div className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-4">
              {error}
              {error.toLowerCase().includes('not configured') && (
                <p className="mt-2 text-xs text-rose-200/80">
                  Set <code className="px-1 rounded bg-black/30">OWNER_USDT_BEP20_ADDRESS</code> in <code className="px-1 rounded bg-black/30">.env.local</code> to enable crypto payments.
                </p>
              )}
            </div>
          )}

          {invoice && !success && (
            <div className="space-y-5">
              <div className="flex justify-between items-baseline">
                <div>
                  <div className="text-xs uppercase tracking-widest text-white/40">Plan</div>
                  <div className="text-lg font-semibold text-white">Pro · 1 month</div>
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase tracking-widest text-white/40">Order</div>
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
                ⚠ Send the <span className="font-semibold">exact amount</span> on the <span className="font-semibold">{invoice.chainLabel}</span> network only. Other networks won't be detected.
              </div>

              <div>
                <label className="block text-xs font-medium text-white/70 mb-1.5">
                  After paying, paste your transaction hash
                </label>
                <input
                  value={txHash}
                  onChange={(e) => setTxHash(e.target.value.trim())}
                  placeholder="0x… 66 characters total"
                  className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-400/30 outline-none transition font-mono text-sm"
                />
                <p className="mt-1 text-xs text-white/40">
                  BEP-20 hashes start with <code>0x</code> followed by 64 hex characters. You can find yours in your wallet&apos;s transaction details or on bscscan.com.
                </p>
                {verifyError && (
                  <div className="mt-2 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-3">
                    {verifyError}
                  </div>
                )}
                <button
                  onClick={verify}
                  disabled={verifying || !/^(0x)?[0-9a-fA-F]{64}$/.test(txHash)}
                  className="mt-3 w-full py-2.5 rounded-lg bg-gradient-to-r from-amber-400 via-fuchsia-500 to-indigo-500 text-slate-950 font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg shadow-fuchsia-500/30"
                >
                  {verifying ? 'Verifying…' : 'Verify payment'}
                </button>
              </div>

              <p className="text-xs text-white/40 text-center">
                Verification typically takes a few seconds after on-chain confirmation.
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
