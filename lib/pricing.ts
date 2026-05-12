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

export const PRO_PERIOD_DAYS = 30;
export const SIGNED_IN_FREE_GENERATIONS = 3;
export const ANON_FREE_GENERATIONS = 1;

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
    priceUSD: 4.99,
    cadence: 'month',
    tagline: 'Unlimited generations, all month long.',
    features: [
      'Unlimited generations',
      'Unlimited downloads',
      'Detailed keyword breakdown',
      'Priority AI throughput',
      'Pay monthly with USDT (TRC-20)',
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

export const SUPPORTED_CHAINS = ['USDT_TRC20'] as const;
export type Chain = (typeof SUPPORTED_CHAINS)[number];

export const CHAIN_LABEL: Record<Chain, string> = {
  USDT_TRC20: 'USDT (TRC-20 / Tron)',
};
