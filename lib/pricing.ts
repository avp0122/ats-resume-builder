export type PlanId = 'free' | 'pro';

export interface Plan {
  id: PlanId;
  name: string;
  priceUSD: number;
  tagline: string;
  features: string[];
  cta: string;
  accent: 'sky' | 'fuchsia' | 'amber';
  highlighted?: boolean;
}

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    priceUSD: 0,
    tagline: 'Try it out, no card needed.',
    features: [
      '2 generations without sign-in',
      'ATS-friendly resume',
      'Tailored cover letter',
      'ATS match score',
      'Download as PDF',
    ],
    cta: 'Get started',
    accent: 'sky',
  },
  {
    id: 'pro',
    name: 'Pro',
    priceUSD: 19,
    tagline: 'Lifetime access. One-time payment.',
    features: [
      'Unlimited generations',
      'Unlimited downloads',
      'Detailed keyword breakdown',
      'Priority AI throughput',
      'Pay with USDT (TRC-20)',
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
