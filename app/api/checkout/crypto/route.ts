import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { getPlan, PlanId } from '@/lib/pricing';
import { getOwnerAddress } from '@/lib/crypto';

/**
 * Create a crypto invoice. Returns an order code + recipient address + amount.
 * The user pays from their own wallet then submits the TX hash to /api/checkout/verify.
 */
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Auth is not configured.' }, { status: 503 });
  }
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }

  const { plan } = (await request.json()) as { plan?: PlanId };
  if (!plan || plan === 'free') {
    return NextResponse.json({ error: 'Invalid plan.' }, { status: 400 });
  }
  const planDef = getPlan(plan);

  const address = getOwnerAddress('USDT_TRC20');
  if (!address) {
    return NextResponse.json(
      { error: 'Crypto payments not configured. Owner address missing.' },
      { status: 503 }
    );
  }

  const orderCode = randomBytes(3).toString('hex').toUpperCase(); // 6 hex chars

  return NextResponse.json({
    chain: 'USDT_TRC20',
    chainLabel: 'USDT (TRC-20 / Tron)',
    address,
    amount: planDef.priceUSD,
    currency: 'USDT',
    orderCode,
    plan: planDef.id,
    notes:
      'Send the EXACT amount. Use any wallet that supports TRC-20. After paying, paste the transaction hash to confirm.',
  });
}
