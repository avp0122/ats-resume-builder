import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import {
  CHAIN_LABEL,
  coerceBillingPeriod,
  coerceChain,
  getProTier,
  PlanId,
} from '@/lib/pricing';
import { getOwnerAddress, isValidAddressForChain } from '@/lib/crypto';

/**
 * Create a crypto invoice. Returns an order code + recipient address + amount.
 * The user pays from their own wallet then submits the TX hash to
 * /api/checkout/verify. The chosen tier + chain is echoed back so the
 * checkout page can render the correct network instructions.
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

  const body = (await request.json()) as {
    plan?: PlanId;
    period?: string;
    chain?: string;
  };
  if (!body.plan || body.plan === 'free') {
    return NextResponse.json({ error: 'Invalid plan.' }, { status: 400 });
  }
  const period = coerceBillingPeriod(body.period);
  const chain = coerceChain(body.chain);
  const tier = getProTier(period);

  const address = getOwnerAddress(chain);
  if (!address) {
    return NextResponse.json(
      {
        error: `Crypto payments not configured for ${chain}. Owner address missing.`,
      },
      { status: 503 }
    );
  }
  if (!isValidAddressForChain(chain, address)) {
    const expectedShape =
      chain === 'USDT_TRC20'
        ? 'a 34-character base58 Tron address starting with "T"'
        : 'a 0x-prefixed 40-character hex address';
    return NextResponse.json(
      {
        error: `Crypto receive address for ${chain} is misconfigured. Owner address must be ${expectedShape}.`,
      },
      { status: 503 }
    );
  }

  const orderCode = randomBytes(3).toString('hex').toUpperCase(); // 6 hex chars

  return NextResponse.json({
    chain,
    chainLabel: CHAIN_LABEL[chain],
    address,
    amount: tier.priceUSD,
    currency: 'USDT',
    orderCode,
    plan: 'pro' as PlanId,
    period,
    periodLabel: tier.label,
    periodDays: tier.periodDays,
    savingsPct: tier.savingsPct,
    notes: `Send the EXACT amount on ${CHAIN_LABEL[chain]} only. Other networks will not be detected. After paying, paste the transaction hash to confirm.`,
  });
}
