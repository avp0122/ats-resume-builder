import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  getOwnerAddress,
  verifyUsdtTransfer,
  isValidTxHashForChain,
  normalizeTxHash,
} from '@/lib/crypto';
import {
  coerceBillingPeriod,
  coerceChain,
  getPlan,
  getProTier,
  PlanId,
  type BillingPeriod,
  type Chain,
} from '@/lib/pricing';

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Auth is not configured.' }, { status: 503 });
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

  const body = (await request.json()) as {
    txHash?: string;
    plan?: PlanId;
    period?: BillingPeriod;
    chain?: Chain;
  };
  if (!body.plan || body.plan === 'free') {
    return NextResponse.json({ error: 'Invalid plan.' }, { status: 400 });
  }
  const planDef = getPlan(body.plan);
  // Period + chain are user-selectable on the checkout page; coerce so a
  // tampered request can't ask for a custom duration or unsupported chain.
  const period = coerceBillingPeriod(body.period);
  const chain = coerceChain(body.chain);
  const tier = getProTier(period);
  // Hash format differs by chain — Tron accepts only bare hex, EVM
  // accepts both bare and 0x-prefixed. Validate per-chain so we don't
  // hand a malformed value to the explorer API.
  if (!body.txHash || !isValidTxHashForChain(chain, body.txHash)) {
    const example =
      chain === 'USDT_TRC20' ? '64 hex characters (no 0x prefix)' : '0x… 66 characters total';
    return NextResponse.json(
      { error: `Invalid transaction hash. Expected ${example}.` },
      { status: 400 }
    );
  }
  // Canonical form used everywhere downstream: lowercase, with the
  // chain's expected prefix. Keeps the unique key in payments.tx_hash
  // stable across explorer copy-paste flavours.
  const txHash = normalizeTxHash(chain, body.txHash);

  // Idempotency: reject if hash already credited.
  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin
    .from('payments')
    .select('id, user_id')
    .eq('tx_hash', txHash)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: 'This transaction has already been used.' },
      { status: 409 }
    );
  }

  const address = getOwnerAddress(chain);
  if (!address) {
    return NextResponse.json(
      { error: `Crypto payments not configured for ${chain}.` },
      { status: 503 }
    );
  }

  const verification = await verifyUsdtTransfer(chain, txHash, address, tier.priceUSD);
  if (!verification.ok) {
    return NextResponse.json(
      { error: verification.reason || 'Verification failed', details: verification },
      { status: 400 }
    );
  }

  // Insert payment + upgrade plan atomically (best-effort).
  const { error: payErr } = await admin.from('payments').insert({
    user_id: user.id,
    tx_hash: txHash,
    chain,
    amount: verification.amount ?? tier.priceUSD,
    currency: 'USDT',
    plan_purchased: planDef.id,
    status: 'verified',
  });
  if (payErr) {
    if ((payErr as any).code === '23505') {
      return NextResponse.json({ error: 'Transaction already used.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to record payment.' }, { status: 500 });
  }
  // Extend pro_until by the chosen tier's period — stack on top of any
  // unexpired subscription so renewing early doesn't cost the user time.
  const { data: existingProfile } = await admin
    .from('profiles')
    .select('pro_until')
    .eq('id', user.id)
    .maybeSingle();
  const baseDate =
    existingProfile?.pro_until && new Date(existingProfile.pro_until) > new Date()
      ? new Date(existingProfile.pro_until)
      : new Date();
  const newProUntil = new Date(
    baseDate.getTime() + tier.periodDays * 24 * 60 * 60 * 1000
  );
  await admin
    .from('profiles')
    .upsert(
      { id: user.id, plan: planDef.id, pro_until: newProUntil.toISOString() },
      { onConflict: 'id' }
    );

  return NextResponse.json({
    ok: true,
    plan: planDef.id,
    period,
    chain,
    proUntil: newProUntil.toISOString(),
  });
}
