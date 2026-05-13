import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getOwnerAddress, verifyUsdtBep20 } from '@/lib/crypto';
import { getPlan, PlanId, PRO_PERIOD_DAYS } from '@/lib/pricing';

// BEP-20 / EVM transaction hashes are 0x-prefixed 64 hex chars. We accept
// the raw 64-hex form too (the checkout page already strips `0x`).
const TX_HASH_RE = /^(0x)?[0-9a-fA-F]{64}$/;

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Auth is not configured.' }, { status: 503 });
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

  const { txHash: rawTxHash, plan } = (await request.json()) as {
    txHash?: string;
    plan?: PlanId;
  };
  if (!rawTxHash || !TX_HASH_RE.test(rawTxHash)) {
    return NextResponse.json({ error: 'Invalid transaction hash.' }, { status: 400 });
  }
  // Normalize to the 0x-prefixed lowercase form so the unique key in
  // `payments.tx_hash` always sees the same value across BscScan/Etherscan
  // copy-paste flavours.
  const txHash = (rawTxHash.startsWith('0x') ? rawTxHash : `0x${rawTxHash}`).toLowerCase();
  if (!plan || plan === 'free') {
    return NextResponse.json({ error: 'Invalid plan.' }, { status: 400 });
  }
  const planDef = getPlan(plan);

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

  const address = getOwnerAddress('USDT_BEP20');
  if (!address) {
    return NextResponse.json({ error: 'Crypto payments not configured.' }, { status: 503 });
  }

  const verification = await verifyUsdtBep20(txHash, address, planDef.priceUSD);
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
    chain: 'USDT_BEP20',
    amount: verification.amount ?? planDef.priceUSD,
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
  // Extend pro_until by PRO_PERIOD_DAYS — stack on top of any unexpired
  // subscription so renewing early doesn't cost the user time.
  const { data: existingProfile } = await admin
    .from('profiles')
    .select('pro_until')
    .eq('id', user.id)
    .maybeSingle();
  const baseDate =
    existingProfile?.pro_until && new Date(existingProfile.pro_until) > new Date()
      ? new Date(existingProfile.pro_until)
      : new Date();
  const newProUntil = new Date(baseDate.getTime() + PRO_PERIOD_DAYS * 24 * 60 * 60 * 1000);
  await admin
    .from('profiles')
    .upsert(
      { id: user.id, plan: planDef.id, pro_until: newProUntil.toISOString() },
      { onConflict: 'id' }
    );

  return NextResponse.json({ ok: true, plan: planDef.id, proUntil: newProUntil.toISOString() });
}
