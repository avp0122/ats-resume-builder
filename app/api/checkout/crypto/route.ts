import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { getPlan, PlanId } from '@/lib/pricing';
import { getOwnerAddress, isValidEvmAddress } from '@/lib/crypto';

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

  const address = getOwnerAddress('USDT_BEP20');
  if (!address) {
    return NextResponse.json(
      { error: 'Crypto payments not configured. Owner address missing.' },
      { status: 503 }
    );
  }
  if (!isValidEvmAddress(address)) {
    return NextResponse.json(
      {
        error:
          'Crypto receive address is misconfigured. OWNER_USDT_BEP20_ADDRESS must be a 0x-prefixed 40-character hex address.',
      },
      { status: 503 }
    );
  }

  const orderCode = randomBytes(3).toString('hex').toUpperCase(); // 6 hex chars

  return NextResponse.json({
    chain: 'USDT_BEP20',
    chainLabel: 'USDT (BEP-20 / BSC)',
    address,
    amount: planDef.priceUSD,
    currency: 'USDT',
    orderCode,
    plan: planDef.id,
    notes:
      'Send the EXACT amount on Binance Smart Chain (BEP-20) only. Other networks will not be detected. After paying, paste the transaction hash to confirm.',
  });
}
