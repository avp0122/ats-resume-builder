import type { Chain } from './pricing';

/**
 * Owner-side payment receiving addresses. Set in env. Never store private keys here.
 */
export function getOwnerAddress(chain: Chain): string | null {
  switch (chain) {
    case 'USDT_TRC20':
      return process.env.OWNER_USDT_TRC20_ADDRESS || null;
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

const USDT_TRC20_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'; // mainnet
const MIN_CONFIRMATIONS = 1;

/**
 * Verify a USDT (TRC-20) transfer using TronGrid's public API.
 * Free tier is unauthenticated; for higher throughput set TRONGRID_API_KEY.
 */
export async function verifyUsdtTrc20(
  txHash: string,
  expectedTo: string,
  expectedAmountUSD: number
): Promise<TxVerificationResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.TRONGRID_API_KEY) {
    headers['TRON-PRO-API-KEY'] = process.env.TRONGRID_API_KEY;
  }

  // Fetch transaction info (includes confirmations + smart-contract logs).
  const infoRes = await fetch('https://api.trongrid.io/wallet/gettransactioninfobyid', {
    method: 'POST',
    headers,
    body: JSON.stringify({ value: txHash }),
  });
  if (!infoRes.ok) return { ok: false, reason: 'TronGrid request failed' };
  const info: any = await infoRes.json();

  if (!info || !info.id) return { ok: false, reason: 'Transaction not found' };
  if (info.receipt?.result && info.receipt.result !== 'SUCCESS') {
    return { ok: false, reason: `Transaction status: ${info.receipt.result}` };
  }

  // The TRC-20 transfer event sits in `log[]` as a Transfer event of the USDT contract.
  const logs: any[] = info.log || [];
  const transferLog = logs.find(
    (l) => l.address && bin2tronAddress(`41${l.address}`) === USDT_TRC20_CONTRACT
  );
  if (!transferLog) return { ok: false, reason: 'No USDT transfer in this tx' };

  // topics[1] = from (padded), topics[2] = to (padded), data = amount (hex)
  const toHex = transferLog.topics?.[2];
  const fromHex = transferLog.topics?.[1];
  const amountHex = transferLog.data;
  if (!toHex || !amountHex) return { ok: false, reason: 'Malformed transfer log' };

  const toAddr = bin2tronAddress(`41${toHex.slice(-40)}`);
  const fromAddr = bin2tronAddress(`41${fromHex.slice(-40)}`);
  const amountRaw = BigInt(`0x${amountHex}`);
  // USDT has 6 decimals.
  const amount = Number(amountRaw) / 1e6;

  if (toAddr.toLowerCase() !== expectedTo.toLowerCase()) {
    return { ok: false, reason: `Wrong recipient (paid to ${toAddr})`, to: toAddr, amount };
  }
  // Allow a small undershoot for rounding; otherwise require >= expected.
  if (amount + 0.01 < expectedAmountUSD) {
    return {
      ok: false,
      reason: `Insufficient amount (paid ${amount} USDT, expected ${expectedAmountUSD})`,
      amount,
      to: toAddr,
    };
  }

  const nowBlock = await getLatestBlockNumber();
  const confirmations = nowBlock && info.blockNumber ? nowBlock - info.blockNumber : 0;
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

async function getLatestBlockNumber(): Promise<number | null> {
  try {
    const res = await fetch('https://api.trongrid.io/wallet/getnowblock');
    const json: any = await res.json();
    return json?.block_header?.raw_data?.number ?? null;
  } catch {
    return null;
  }
}

/**
 * Convert a Tron hex address (41XXXXXXXX...) to base58 (T...).
 * Implemented locally to avoid pulling a tron-specific dep.
 */
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
