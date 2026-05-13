export type PlanId = 'free' | 'pro';

export interface Plan {
  id: PlanId;
  name: string;
  priceUSD: number;
  /** Billing cadence shown in UI. */
  cadence: 'forever' | 'month';
  tagline: string;
  features: string[];
  cta: string;
  accent: 'sky' | 'fuchsia' | 'amber';
  highlighted?: boolean;
}

// Pro now has multiple billing periods. PlanId on the profile stays a
// simple 'free' | 'pro' because the database only cares whether you ARE
// pro, not for how long — `pro_until` carries the period.
export type BillingPeriod = 'month' | 'quarter' | 'year';

export interface ProTier {
  period: BillingPeriod;
  label: string;
  periodDays: number;
  priceUSD: number;
  /** Percentage saved vs. paying month-by-month. 0 for the monthly tier. */
  savingsPct: number;
  badge?: string;
  /** Marketing copy below the price. */
  blurb: string;
}

const MONTHLY_USD = 4.99;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Pro tiers, in display order. The savings percentages are applied to the
 * straight-line monthly price (e.g. 12 × 4.99 = 59.88, year tier at 30%
 * off = 41.92). Update the percentages here and the displayed price + the
 * checkout charge stay in sync.
 */
export const PRO_TIERS: ProTier[] = [
  {
    period: 'month',
    label: '1 month',
    periodDays: 30,
    priceUSD: MONTHLY_USD,
    savingsPct: 0,
    blurb: 'Pay-as-you-go. Cancel by not paying.',
  },
  {
    period: 'quarter',
    label: '3 months',
    periodDays: 90,
    priceUSD: round2(3 * MONTHLY_USD * 0.8),
    savingsPct: 20,
    badge: 'POPULAR',
    blurb: 'Three months up-front — 20% off.',
  },
  {
    period: 'year',
    label: '1 year',
    periodDays: 365,
    priceUSD: round2(12 * MONTHLY_USD * 0.7),
    savingsPct: 30,
    badge: 'BEST VALUE',
    blurb: 'A year of unlimited generations — 30% off.',
  },
];

export const DEFAULT_PRO_PERIOD: BillingPeriod = 'month';

export function getProTier(period: BillingPeriod): ProTier {
  const tier = PRO_TIERS.find((t) => t.period === period);
  if (!tier) throw new Error(`Unknown Pro billing period: ${period}`);
  return tier;
}

/**
 * Type-narrowing helper used by the checkout routes — anything else falls
 * back to the monthly default so a tampered URL can't ask for a custom
 * period.
 */
export function coerceBillingPeriod(value: unknown): BillingPeriod {
  if (value === 'month' || value === 'quarter' || value === 'year') return value;
  return DEFAULT_PRO_PERIOD;
}

export const SIGNED_IN_FREE_GENERATIONS = 3;
export const ANON_FREE_GENERATIONS = 1;

/**
 * Static list rendered by the pricing page. Pro is shown as a single
 * card; the period selector lives inside the card and resolves to a
 * concrete ProTier at checkout time. We keep the entry-level monthly
 * price on the Pro Plan object so users see the "$4.99 starting" anchor.
 */
export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    priceUSD: 0,
    cadence: 'forever',
    tagline: 'Try it without an account.',
    features: [
      `${ANON_FREE_GENERATIONS} generation without sign-in`,
      `${SIGNED_IN_FREE_GENERATIONS} generations / month after sign-up`,
      'ATS-friendly resume + cover letter',
      'ATS match score',
      'Download as PDF',
    ],
    cta: 'Get started',
    accent: 'sky',
  },
  {
    id: 'pro',
    name: 'Pro',
    priceUSD: MONTHLY_USD,
    cadence: 'month',
    tagline: 'Unlimited generations. Choose a billing period.',
    features: [
      'Unlimited generations',
      'Unlimited downloads',
      'Detailed keyword breakdown',
      'Priority AI throughput',
      'Pay with USDT (BEP-20 or ERC-20)',
    ],
    cta: 'Upgrade with crypto',
    accent: 'fuchsia',
    highlighted: true,
  },
];

export function getPlan(id: PlanId): Plan {
  const plan = PLANS.find((p) => p.id === id);
  if (!plan) throw new Error(`Unknown plan: ${id}`);
  return plan;
}

// Two USDT receive chains: BEP-20 (BSC) and ERC-20 (Ethereum mainnet).
export const SUPPORTED_CHAINS = ['USDT_BEP20', 'USDT_ERC20'] as const;
export type Chain = (typeof SUPPORTED_CHAINS)[number];

export const CHAIN_LABEL: Record<Chain, string> = {
  USDT_BEP20: 'USDT (BEP-20 / BSC)',
  USDT_ERC20: 'USDT (ERC-20 / Ethereum)',
};

export const DEFAULT_CHAIN: Chain = 'USDT_BEP20';

export function coerceChain(value: unknown): Chain {
  if (value === 'USDT_BEP20' || value === 'USDT_ERC20') return value;
  return DEFAULT_CHAIN;
}
