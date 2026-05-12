import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getOwnerAddress, verifyUsdtTrc20 } from '@/lib/crypto';
import { getPlan, PlanId, PRO_PERIOD_DAYS } from '@/lib/pricing';

const TX_HASH_RE = /^[0-9a-fA-F]{64}$/;

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Auth is not configured.' }, { status: 503 });
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

  const { txHash, plan } = (await request.json()) as { txHash?: string; plan?: PlanId };
  if (!txHash || !TX_HASH_RE.test(txHash)) {
    return NextResponse.json({ error: 'Invalid transaction hash.' }, { status: 400 });
  }
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

  const address = getOwnerAddress('USDT_TRC20');
  if (!address) {
    return NextResponse.json({ error: 'Crypto payments not configured.' }, { status: 503 });
  }

  const verification = await verifyUsdtTrc20(txHash, address, planDef.priceUSD);
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
    chain: 'USDT_TRC20',
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
