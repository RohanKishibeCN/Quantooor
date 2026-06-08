import { createPublicClient, createWalletClient, formatUnits, http, parseUnits } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import type { UnsignedTx } from "../minara/types.js";

export type SwapBroadcastResult = {
  approvalTxHash?: `0x${string}`;
  swapTxHash: `0x${string}`;
  gasUsdUpperBound: number;
};

export async function estimateGasUsdUpperBound(opts: {
  rpcUrl: string;
  from: `0x${string}`;
  tx: UnsignedTx;
  nativeUsdPrice: number;
}): Promise<number> {
  const publicClient = createPublicClient({ chain: base, transport: http(opts.rpcUrl) });
  const txRequest = toTxRequest(opts.from, opts.tx);

  const gas = await publicClient.estimateGas(txRequest);
  const fees = await publicClient.estimateFeesPerGas();
  const maxFeePerGas = fees.maxFeePerGas ?? (await publicClient.getGasPrice());
  const costWei = gas * maxFeePerGas;
  const costEth = Number(formatUnits(costWei, 18));
  return costEth * opts.nativeUsdPrice;
}

export async function broadcastUnsignedTx(opts: {
  rpcUrl: string;
  privateKey: `0x${string}`;
  approvalTx?: UnsignedTx | null;
  swapTx: UnsignedTx;
}): Promise<{ approvalTxHash?: `0x${string}`; swapTxHash: `0x${string}` }> {
  const account = privateKeyToAccount(opts.privateKey);
  const publicClient = createPublicClient({ chain: base, transport: http(opts.rpcUrl) });
  const walletClient = createWalletClient({ chain: base, transport: http(opts.rpcUrl), account });

  let approvalTxHash: `0x${string}` | undefined;
  if (opts.approvalTx) {
    approvalTxHash = await walletClient.sendTransaction(toTxRequest(account.address, opts.approvalTx));
    await publicClient.waitForTransactionReceipt({ hash: approvalTxHash });
  }

  const swapTxHash = await walletClient.sendTransaction(toTxRequest(account.address, opts.swapTx));
  await publicClient.waitForTransactionReceipt({ hash: swapTxHash });

  return { approvalTxHash, swapTxHash };
}

function toTxRequest(from: `0x${string}`, tx: UnsignedTx) {
  const value = normalizeBigint(tx.value) ?? undefined;
  const gas = normalizeBigint(tx.gas) ?? undefined;

  const maxFeePerGas = normalizeBigint(tx.maxFeePerGas) ?? undefined;
  const maxPriorityFeePerGas = normalizeBigint(tx.maxPriorityFeePerGas) ?? undefined;

  return {
    account: from,
    to: tx.to,
    data: tx.data,
    value,
    gas,
    maxFeePerGas,
    maxPriorityFeePerGas,
  } as const;
}

function normalizeBigint(v: unknown): bigint | null {
  if (v == null) return null;
  if (typeof v === "bigint") return v;
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v < 0) return null;
    return BigInt(Math.floor(v));
  }
  if (typeof v === "string") {
    const s = v.trim();
    if (s === "") return null;
    if (/^0x[0-9a-f]+$/i.test(s)) return BigInt(s);
    if (/^\d+(\.\d+)?$/.test(s)) {
      if (s.includes(".")) return parseUnits(s, 0);
      return BigInt(s);
    }
  }
  return null;
}
