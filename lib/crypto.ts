import type { Chain } from './pricing';

/**
 * Owner-side payment receiving addresses. Set in env. Never store private keys here.
 *
 * BEP-20 (BSC) is the active receive chain. The previous TRC-20 (Tron)
 * support has been removed because the project switched payment rails —
 * keeping both would mean maintaining two verifiers for no benefit.
 */
export function getOwnerAddress(chain: Chain): string | null {
  switch (chain) {
    case 'USDT_BEP20':
      return process.env.OWNER_USDT_BEP20_ADDRESS || null;
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

// Binance-Smart-Chain mainnet USDT (BEP-20). Verified on BscScan.
// https://bscscan.com/address/0x55d398326f99059ff775485246999027b3197955
const USDT_BEP20_CONTRACT = '0x55d398326f99059ff775485246999027b3197955';
const USDT_BEP20_DECIMALS = 18; // BSC USDT uses 18 decimals (not 6 like Tron/ETH)
const MIN_CONFIRMATIONS = 3; // ~9s of finality on BSC

// Etherscan's unified V2 API. BscScan was folded into it: BSC queries now
// go to the same host with `chainid=56`. A single Etherscan API key covers
// every chain Etherscan supports, so BSCSCAN_API_KEY (which is an
// Etherscan-issued key now) and ETHERSCAN_API_KEY are interchangeable —
// we accept both env names for migration friendliness.
const ETHERSCAN_V2_API = 'https://api.etherscan.io/v2/api';
const BSC_CHAIN_ID = '56';

function getEtherscanApiKey(): string {
  return process.env.BSCSCAN_API_KEY || process.env.ETHERSCAN_API_KEY || '';
}

interface BscReceipt {
  status: string;
  blockNumber: string;
  logs: Array<{
    address: string;
    topics: string[];
    data: string;
  }>;
}

interface BscTx {
  blockNumber: string;
  from: string;
  to: string;
  input: string;
  hash: string;
}

/**
 * Verify a USDT (BEP-20) transfer using the Etherscan V2 API.
 *
 * Etherscan rolled BscScan into a single multichain API in 2024: BSC is
 * just chain 56 on the V2 host. The free tier without a key is severely
 * rate-limited (~1 req / 5s) — production should set BSCSCAN_API_KEY (or
 * ETHERSCAN_API_KEY, which is the same key under the unified Etherscan
 * account).
 */
export async function verifyUsdtBep20(
  txHash: string,
  expectedTo: string,
  expectedAmountUSD: number
): Promise<TxVerificationResult> {
  const apiKey = getEtherscanApiKey();
  const qs = (params: Record<string, string>) =>
    new URLSearchParams({ chainid: BSC_CHAIN_ID, ...params, apikey: apiKey }).toString();

  // 1. Pull the transaction receipt — gives us status + logs (the ERC-20
  //    Transfer event sits in there as topic0 = keccak256("Transfer(...)")).
  const receiptRes = await fetch(
    `${ETHERSCAN_V2_API}?${qs({
      module: 'proxy',
      action: 'eth_getTransactionReceipt',
      txhash: txHash,
    })}`
  );
  if (!receiptRes.ok) return { ok: false, reason: 'Etherscan V2 request failed' };
  const receiptJson: {
    result?: BscReceipt | null;
    error?: { message?: string };
    message?: string;
  } = await receiptRes.json();
  // The V2 API returns rate-limit / auth errors as `{status: "0", message,
  // result: "..."}` — catch those before we try to read logs off `result`.
  if (receiptJson.message && /rate limit|invalid api key/i.test(receiptJson.message)) {
    return { ok: false, reason: `Etherscan V2: ${receiptJson.message}` };
  }
  const receipt = receiptJson.result && typeof receiptJson.result === 'object'
    ? (receiptJson.result as BscReceipt)
    : null;
  if (!receipt) return { ok: false, reason: 'Transaction not found' };
  if (!receipt.status || parseInt(receipt.status, 16) !== 1) {
    return { ok: false, reason: 'Transaction reverted on-chain' };
  }

  // Find the USDT Transfer log emitted by the BEP-20 contract. The Transfer
  // event topic0 is keccak256("Transfer(address,address,uint256)").
  const TRANSFER_TOPIC =
    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  const transferLog = (receipt.logs || []).find(
    (l) =>
      l.address &&
      l.address.toLowerCase() === USDT_BEP20_CONTRACT.toLowerCase() &&
      l.topics &&
      l.topics[0]?.toLowerCase() === TRANSFER_TOPIC
  );
  if (!transferLog) return { ok: false, reason: 'No USDT BEP-20 transfer in this tx' };

  // topics[1] = from (32-byte padded), topics[2] = to (32-byte padded),
  // data = uint256 amount (hex).
  const fromTopic = transferLog.topics[1];
  const toTopic = transferLog.topics[2];
  const amountHex = transferLog.data;
  if (!fromTopic || !toTopic || !amountHex) {
    return { ok: false, reason: 'Malformed transfer log' };
  }
  const toAddr = '0x' + toTopic.slice(-40);
  const fromAddr = '0x' + fromTopic.slice(-40);
  const amountRaw = BigInt(amountHex);
  // 18 decimals, but USDT is a USD-pegged stable so divide by 1e18 for the
  // human-readable USDT figure.
  const amount = Number(amountRaw) / 10 ** USDT_BEP20_DECIMALS;

  if (toAddr.toLowerCase() !== expectedTo.toLowerCase()) {
    return {
      ok: false,
      reason: `Wrong recipient (paid to ${toAddr})`,
      to: toAddr,
      amount,
    };
  }
  // Allow a tiny 0.01 USDT undershoot for floating rounding; otherwise the
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

  const nowBlock = await getBscLatestBlock();
  const txBlock = parseInt(receipt.blockNumber, 16);
  const confirmations =
    nowBlock !== null && !Number.isNaN(txBlock) ? Math.max(0, nowBlock - txBlock) : 0;
  if (confirmations < MIN_CONFIRMATIONS) {
    return {
      ok: false,
      reason: `Awaiting confirmations (${confirmations}/${MIN_CONFIRMATIONS})`,
      confirmations,
      amount,
      to: toAddr,
      from: fromAddr,
    };
  }

  return { ok: true, amount, to: toAddr, from: fromAddr, confirmations };
}

async function getBscLatestBlock(): Promise<number | null> {
  const apiKey = getEtherscanApiKey();
  try {
    const res = await fetch(
      `${ETHERSCAN_V2_API}?${new URLSearchParams({
        chainid: BSC_CHAIN_ID,
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
 * Address validity check for a BEP-20 (EVM) address. Used by the checkout
 * route so we fail with a clear message if OWNER_USDT_BEP20_ADDRESS is
 * malformed (a common config slip when copying from a wallet).
 */
export function isValidEvmAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}
