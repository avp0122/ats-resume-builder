import type { Chain } from './pricing';

/**
 * Owner-side payment receiving addresses. Set in env. Never store private keys here.
 *
 * Two USDT receive chains are supported:
 *   - TRC-20 on Tron (low fees, ~1 min confirmations)
 *   - ERC-20 on Ethereum mainnet (universal but high fees, ~3 min)
 *
 * BEP-20 was tried briefly and removed in favour of TRC-20 — keep both
 * env var names cleared if you've migrated.
 */
export function getOwnerAddress(chain: Chain): string | null {
  switch (chain) {
    case 'USDT_TRC20':
      return process.env.OWNER_USDT_TRC20_ADDRESS || null;
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

/**
 * Chain-dispatching verifier. TRC-20 (Tron) uses the TronGrid REST API
 * with its own address format; ERC-20 (Ethereum) uses Etherscan V2.
 * The shape of TxVerificationResult is identical so callers don't need
 * to know which chain ran.
 */
export async function verifyUsdtTransfer(
  chain: Chain,
  txHash: string,
  expectedTo: string,
  expectedAmountUSD: number
): Promise<TxVerificationResult> {
  switch (chain) {
    case 'USDT_TRC20':
      return verifyTrc20(txHash, expectedTo, expectedAmountUSD);
    case 'USDT_ERC20':
      return verifyErc20(txHash, expectedTo, expectedAmountUSD);
    default:
      return { ok: false, reason: `Unsupported chain: ${chain}` };
  }
}

// ─── ERC-20 / Ethereum via Etherscan V2 API ────────────────────────────
// One host, one key, many chains. Ethereum = chainid 1.
// Either ETHSCAN_API_KEY, ETHERSCAN_API_KEY, or BSCSCAN_API_KEY satisfies
// it (same unified Etherscan account); the user set ETHSCAN_API_KEY in
// .env.local so we accept that variant explicitly.
const ETHERSCAN_V2_API = 'https://api.etherscan.io/v2/api';
const ETH_CHAIN_ID = '1';
// https://etherscan.io/address/0xdac17f958d2ee523a2206206994597c13d831ec7
const USDT_ERC20_CONTRACT = '0xdac17f958d2ee523a2206206994597c13d831ec7';
const USDT_ERC20_DECIMALS = 6;
const ETH_MIN_CONFIRMATIONS = 12; // ~3 min of ETH finality; matches CEX practice

function getEtherscanApiKey(): string {
  return (
    process.env.ETHSCAN_API_KEY ||
    process.env.ETHERSCAN_API_KEY ||
    process.env.BSCSCAN_API_KEY ||
    ''
  );
}

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

async function verifyErc20(
  txHash: string,
  expectedTo: string,
  expectedAmountUSD: number
): Promise<TxVerificationResult> {
  const apiKey = getEtherscanApiKey();
  const qs = (params: Record<string, string>) =>
    new URLSearchParams({ chainid: ETH_CHAIN_ID, ...params, apikey: apiKey }).toString();

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
  // V2 returns rate-limit / auth errors as `{status:"0", message, result:"<text>"}`.
  // Detect those before we try to read logs off a string.
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

  const transferLog = (receipt.logs || []).find(
    (l) =>
      l.address &&
      l.address.toLowerCase() === USDT_ERC20_CONTRACT.toLowerCase() &&
      l.topics &&
      l.topics[0]?.toLowerCase() === TRANSFER_TOPIC
  );
  if (!transferLog) return { ok: false, reason: 'No USDT ERC-20 transfer in this tx' };

  const fromTopic = transferLog.topics[1];
  const toTopic = transferLog.topics[2];
  const amountHex = transferLog.data;
  if (!fromTopic || !toTopic || !amountHex) {
    return { ok: false, reason: 'Malformed transfer log' };
  }
  const toAddr = '0x' + toTopic.slice(-40);
  const fromAddr = '0x' + fromTopic.slice(-40);
  const amountRaw = BigInt(amountHex);
  const amount = Number(amountRaw) / 10 ** USDT_ERC20_DECIMALS;

  if (toAddr.toLowerCase() !== expectedTo.toLowerCase()) {
    return {
      ok: false,
      reason: `Wrong recipient (paid to ${toAddr})`,
      to: toAddr,
      amount,
    };
  }
  if (amount + 0.01 < expectedAmountUSD) {
    return {
      ok: false,
      reason: `Insufficient amount (paid ${amount} USDT, expected ${expectedAmountUSD})`,
      amount,
      to: toAddr,
      from: fromAddr,
    };
  }

  const nowBlock = await getEthLatestBlock();
  const txBlock = parseInt(receipt.blockNumber, 16);
  const confirmations =
    nowBlock !== null && !Number.isNaN(txBlock) ? Math.max(0, nowBlock - txBlock) : 0;
  if (confirmations < ETH_MIN_CONFIRMATIONS) {
    return {
      ok: false,
      reason: `Awaiting confirmations (${confirmations}/${ETH_MIN_CONFIRMATIONS})`,
      confirmations,
      amount,
      to: toAddr,
      from: fromAddr,
    };
  }

  return { ok: true, amount, to: toAddr, from: fromAddr, confirmations };
}

async function getEthLatestBlock(): Promise<number | null> {
  const apiKey = getEtherscanApiKey();
  try {
    const res = await fetch(
      `${ETHERSCAN_V2_API}?${new URLSearchParams({
        chainid: ETH_CHAIN_ID,
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

// ─── TRC-20 / Tron via TronGrid ────────────────────────────────────────
// Tron is NOT EVM. Different REST API, different address encoding
// (base58 starting with "T"), tx hashes are 64 hex chars without 0x.
//
// https://tronscan.org/#/token20/TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
const USDT_TRC20_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const USDT_TRC20_DECIMALS = 6;
const TRON_MIN_CONFIRMATIONS = 19; // ~1 min of Tron finality (super-majority)
const TRONGRID_API = 'https://api.trongrid.io';

function tronHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.TRONGRID_API_KEY) h['TRON-PRO-API-KEY'] = process.env.TRONGRID_API_KEY;
  return h;
}

async function verifyTrc20(
  txHash: string,
  expectedTo: string,
  expectedAmountUSD: number
): Promise<TxVerificationResult> {
  // gettransactioninfobyid returns the receipt incl. event logs.
  const infoRes = await fetch(`${TRONGRID_API}/wallet/gettransactioninfobyid`, {
    method: 'POST',
    headers: tronHeaders(),
    body: JSON.stringify({ value: txHash }),
  });
  if (!infoRes.ok) return { ok: false, reason: 'TronGrid request failed' };
  const info: any = await infoRes.json();
  if (!info || !info.id) return { ok: false, reason: 'Transaction not found' };
  if (info.receipt?.result && info.receipt.result !== 'SUCCESS') {
    return { ok: false, reason: `Transaction status: ${info.receipt.result}` };
  }

  // The TRC-20 transfer event sits in `log[]` as a Transfer event of the
  // USDT contract. log[i].address is the contract in HEX (without the
  // 0x41 mainnet prefix), so we add 41 back before converting to base58.
  const logs: any[] = info.log || [];
  const transferLog = logs.find(
    (l) => l.address && bin2tronAddress(`41${l.address}`) === USDT_TRC20_CONTRACT
  );
  if (!transferLog) return { ok: false, reason: 'No USDT TRC-20 transfer in this tx' };

  // topics[1] = from (padded), topics[2] = to, data = amount (hex).
  const toHex = transferLog.topics?.[2];
  const fromHex = transferLog.topics?.[1];
  const amountHex = transferLog.data;
  if (!toHex || !amountHex) return { ok: false, reason: 'Malformed transfer log' };

  const toAddr = bin2tronAddress(`41${toHex.slice(-40)}`);
  const fromAddr = bin2tronAddress(`41${fromHex.slice(-40)}`);
  const amountRaw = BigInt(`0x${amountHex}`);
  const amount = Number(amountRaw) / 10 ** USDT_TRC20_DECIMALS;

  if (toAddr.toLowerCase() !== expectedTo.toLowerCase()) {
    return { ok: false, reason: `Wrong recipient (paid to ${toAddr})`, to: toAddr, amount };
  }
  if (amount + 0.01 < expectedAmountUSD) {
    return {
      ok: false,
      reason: `Insufficient amount (paid ${amount} USDT, expected ${expectedAmountUSD})`,
      amount,
      to: toAddr,
      from: fromAddr,
    };
  }

  const nowBlock = await getTronLatestBlock();
  const confirmations =
    nowBlock !== null && info.blockNumber ? Math.max(0, nowBlock - info.blockNumber) : 0;
  if (confirmations < TRON_MIN_CONFIRMATIONS) {
    return {
      ok: false,
      reason: `Awaiting confirmations (${confirmations}/${TRON_MIN_CONFIRMATIONS})`,
      confirmations,
      amount,
      to: toAddr,
      from: fromAddr,
    };
  }
  return { ok: true, amount, to: toAddr, from: fromAddr, confirmations };
}

async function getTronLatestBlock(): Promise<number | null> {
  try {
    const res = await fetch(`${TRONGRID_API}/wallet/getnowblock`, { headers: tronHeaders() });
    const json: any = await res.json();
    return json?.block_header?.raw_data?.number ?? null;
  } catch {
    return null;
  }
}

// ─── Tron base58 address encoding (vendored, ~30 lines) ────────────────
// Convert a Tron hex address (41XXXXXXXX…) → base58 (T…). Vendored to
// avoid pulling a tron-specific SDK just for this one operation.

function bin2tronAddress(hex: string): string {
  if (hex.length !== 42) return hex;
  const bytes = hexToBytes(hex);
  const checksum = sha256(sha256(bytes)).slice(0, 4);
  return base58Encode(concat(bytes, checksum));
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function sha256(data: Uint8Array): Uint8Array {
  // Node's crypto in route handlers
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createHash } = require('crypto') as typeof import('crypto');
  return new Uint8Array(createHash('sha256').update(data).digest());
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58Encode(input: Uint8Array): string {
  let x = 0n;
  for (const b of input) x = (x << 8n) | BigInt(b);
  let out = '';
  while (x > 0n) {
    const rem = Number(x % 58n);
    x = x / 58n;
    out = B58[rem] + out;
  }
  for (const b of input) {
    if (b === 0) out = '1' + out;
    else break;
  }
  return out;
}

// ─── Address validators ────────────────────────────────────────────────

/** EVM address — 0x + 40 hex chars (ERC-20). */
export function isValidEvmAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

/** Tron base58 address — starts with T, 34 chars total (TRC-20). */
export function isValidTronAddress(addr: string): boolean {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr);
}

/** Dispatcher used by the checkout route to validate the configured
 *  receive address against the chain it claims to be on. */
export function isValidAddressForChain(chain: Chain, addr: string): boolean {
  switch (chain) {
    case 'USDT_TRC20':
      return isValidTronAddress(addr);
    case 'USDT_ERC20':
      return isValidEvmAddress(addr);
    default:
      return false;
  }
}

/**
 * TX-hash validator per chain. EVM accepts an optional 0x prefix; Tron
 * is bare 64 hex chars (TronGrid rejects the prefix).
 */
export function isValidTxHashForChain(chain: Chain, hash: string): boolean {
  switch (chain) {
    case 'USDT_ERC20':
      return /^(0x)?[0-9a-fA-F]{64}$/.test(hash);
    case 'USDT_TRC20':
      return /^[0-9a-fA-F]{64}$/.test(hash);
    default:
      return false;
  }
}

/**
 * Normalize a tx hash to the form the chain's API expects. EVM →
 * lowercase 0x-prefixed (so the unique key in payments.tx_hash sees the
 * same value across explorers). Tron → bare lowercase hex.
 */
export function normalizeTxHash(chain: Chain, hash: string): string {
  const stripped = hash.startsWith('0x') ? hash.slice(2) : hash;
  switch (chain) {
    case 'USDT_ERC20':
      return `0x${stripped.toLowerCase()}`;
    case 'USDT_TRC20':
      return stripped.toLowerCase();
    default:
      return hash;
  }
}
