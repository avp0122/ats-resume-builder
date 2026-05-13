import type { Chain } from './pricing';

/**
 * Owner-side payment receiving addresses. Set in env. Never store private keys here.
 *
 * Two USDT receive chains are supported:
 *   - BEP-20 on Binance Smart Chain (low fees)
 *   - ERC-20 on Ethereum mainnet (higher fees but the most universal)
 */
export function getOwnerAddress(chain: Chain): string | null {
  switch (chain) {
    case 'USDT_BEP20':
      return process.env.OWNER_USDT_BEP20_ADDRESS || null;
    case 'USDT_ERC20':
      return process.env.OWNER_USDT_ERC20_ADDRESS || null;
    default:
      return null;
  }
}

export interface TxVerificationResult {
  ok: boolean;
  reason?: string;
  amount?: number;
  to?: string;
  from?: string;
  confirmations?: number;
}

// ─── Etherscan V2 API ──────────────────────────────────────────────────
// One host, one key, many chains. BSC = chainid 56, Ethereum = chainid 1.
// Either BSCSCAN_API_KEY, ETHSCAN_API_KEY, or ETHERSCAN_API_KEY satisfies
// it — the user set ETHSCAN_API_KEY when wiring up ERC-20, so we accept
// that variant explicitly.
const ETHERSCAN_V2_API = 'https://api.etherscan.io/v2/api';

function getEtherscanApiKey(): string {
  return (
    process.env.BSCSCAN_API_KEY ||
    process.env.ETHSCAN_API_KEY ||
    process.env.ETHERSCAN_API_KEY ||
    ''
  );
}

// ─── Per-chain USDT contract config ────────────────────────────────────
// USDT on BSC has 18 decimals (unlike ETH USDT's 6) — these are real
// on-chain quirks, not our convention.
interface ChainConfig {
  chainId: string;
  contract: string;
  decimals: number;
  /** Block-finality target. Higher for ETH (slower blocks). */
  minConfirmations: number;
  /** Human label used inside error messages. */
  label: string;
}

const CHAIN_CONFIG: Record<Chain, ChainConfig> = {
  USDT_BEP20: {
    chainId: '56',
    // https://bscscan.com/address/0x55d398326f99059ff775485246999027b3197955
    contract: '0x55d398326f99059ff775485246999027b3197955',
    decimals: 18,
    minConfirmations: 3, // ~9s of BSC finality
    label: 'BEP-20',
  },
  USDT_ERC20: {
    chainId: '1',
    // https://etherscan.io/address/0xdac17f958d2ee523a2206206994597c13d831ec7
    contract: '0xdac17f958d2ee523a2206206994597c13d831ec7',
    decimals: 6,
    minConfirmations: 12, // ~3min of ETH finality; matches CEX practice
    label: 'ERC-20',
  },
};

interface EvmReceipt {
  status: string;
  blockNumber: string;
  logs: Array<{
    address: string;
    topics: string[];
    data: string;
  }>;
}

// ERC-20 Transfer event topic0 = keccak256("Transfer(address,address,uint256)")
const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/**
 * Chain-dispatching verifier. Pulls the receipt from Etherscan V2 on the
 * correct chain, locates the USDT Transfer log, and validates recipient
 * + amount + confirmations.
 *
 * The flow is identical for both chains because Etherscan V2 unified the
 * BSC and Ethereum REST surfaces — only the chain id, contract address,
 * and decimals differ.
 */
export async function verifyUsdtTransfer(
  chain: Chain,
  txHash: string,
  expectedTo: string,
  expectedAmountUSD: number
): Promise<TxVerificationResult> {
  const cfg = CHAIN_CONFIG[chain];
  if (!cfg) return { ok: false, reason: `Unsupported chain: ${chain}` };
  const apiKey = getEtherscanApiKey();
  const qs = (params: Record<string, string>) =>
    new URLSearchParams({ chainid: cfg.chainId, ...params, apikey: apiKey }).toString();

  // 1. Fetch the transaction receipt (status + logs).
  const receiptRes = await fetch(
    `${ETHERSCAN_V2_API}?${qs({
      module: 'proxy',
      action: 'eth_getTransactionReceipt',
      txhash: txHash,
    })}`
  );
  if (!receiptRes.ok) return { ok: false, reason: 'Etherscan V2 request failed' };
  const receiptJson: {
    result?: EvmReceipt | string | null;
    error?: { message?: string };
    message?: string;
  } = await receiptRes.json();
  // The V2 API returns rate-limit / auth errors as `{status: "0", message,
  // result: "<text>"}` — catch those before we try to read logs off a
  // string.
  if (
    receiptJson.message &&
    /rate limit|invalid api key|notok/i.test(receiptJson.message) &&
    typeof receiptJson.result === 'string'
  ) {
    return { ok: false, reason: `Etherscan V2: ${receiptJson.message}` };
  }
  const receipt =
    receiptJson.result && typeof receiptJson.result === 'object'
      ? (receiptJson.result as EvmReceipt)
      : null;
  if (!receipt) return { ok: false, reason: 'Transaction not found' };
  if (!receipt.status || parseInt(receipt.status, 16) !== 1) {
    return { ok: false, reason: 'Transaction reverted on-chain' };
  }

  // 2. Find the USDT Transfer log on the right contract.
  const transferLog = (receipt.logs || []).find(
    (l) =>
      l.address &&
      l.address.toLowerCase() === cfg.contract.toLowerCase() &&
      l.topics &&
      l.topics[0]?.toLowerCase() === TRANSFER_TOPIC
  );
  if (!transferLog) {
    return { ok: false, reason: `No USDT ${cfg.label} transfer in this tx` };
  }

  // topics[1] = from (32-byte padded), topics[2] = to, data = uint256 amount.
  const fromTopic = transferLog.topics[1];
  const toTopic = transferLog.topics[2];
  const amountHex = transferLog.data;
  if (!fromTopic || !toTopic || !amountHex) {
    return { ok: false, reason: 'Malformed transfer log' };
  }
  const toAddr = '0x' + toTopic.slice(-40);
  const fromAddr = '0x' + fromTopic.slice(-40);
  const amountRaw = BigInt(amountHex);
  const amount = Number(amountRaw) / 10 ** cfg.decimals;

  if (toAddr.toLowerCase() !== expectedTo.toLowerCase()) {
    return {
      ok: false,
      reason: `Wrong recipient (paid to ${toAddr})`,
      to: toAddr,
      amount,
    };
  }
  // Allow 0.01 USDT undershoot for floating rounding; otherwise the
  // payer must have sent at least the expected amount.
  if (amount + 0.01 < expectedAmountUSD) {
    return {
      ok: false,
      reason: `Insufficient amount (paid ${amount} USDT, expected ${expectedAmountUSD})`,
      amount,
      to: toAddr,
      from: fromAddr,
    };
  }

  const nowBlock = await getLatestBlock(cfg);
  const txBlock = parseInt(receipt.blockNumber, 16);
  const confirmations =
    nowBlock !== null && !Number.isNaN(txBlock) ? Math.max(0, nowBlock - txBlock) : 0;
  if (confirmations < cfg.minConfirmations) {
    return {
      ok: false,
      reason: `Awaiting confirmations (${confirmations}/${cfg.minConfirmations})`,
      confirmations,
      amount,
      to: toAddr,
      from: fromAddr,
    };
  }

  return { ok: true, amount, to: toAddr, from: fromAddr, confirmations };
}

async function getLatestBlock(cfg: ChainConfig): Promise<number | null> {
  const apiKey = getEtherscanApiKey();
  try {
    const res = await fetch(
      `${ETHERSCAN_V2_API}?${new URLSearchParams({
        chainid: cfg.chainId,
        module: 'proxy',
        action: 'eth_blockNumber',
        apikey: apiKey,
      }).toString()}`
    );
    const json: { result?: string } = await res.json();
    if (typeof json.result !== 'string') return null;
    return parseInt(json.result, 16);
  } catch {
    return null;
  }
}

/**
 * Backwards-compat alias for the legacy single-chain caller. Some routes
 * may still import the BEP-20-named function; route them through the
 * unified verifier.
 *
 * @deprecated Use verifyUsdtTransfer('USDT_BEP20', ...) instead.
 */
export function verifyUsdtBep20(
  txHash: string,
  expectedTo: string,
  expectedAmountUSD: number
): Promise<TxVerificationResult> {
  return verifyUsdtTransfer('USDT_BEP20', txHash, expectedTo, expectedAmountUSD);
}

/**
 * Address validity check for an EVM (BEP-20 / ERC-20) address. Used by
 * the checkout route so we fail with a clear message if the configured
 * owner address is malformed (a common config slip when copying from a
 * wallet).
 */
export function isValidEvmAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}
