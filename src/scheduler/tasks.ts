import type { Account } from "../accounts/store.js";
import type { RuntimeConfig } from "../config/runtime.js";
import { MinaraClient } from "../minara/client.js";
import type { IntentToSwapTxResponse, UnsignedTx } from "../minara/types.js";
import { broadcastUnsignedTx, estimateGasUsdUpperBound } from "../trade/baseSwap.js";

export type TaskResult = {
  kind: "swap";
  accountId: string;
  approvalTxHash?: `0x${string}`;
  swapTxHash: `0x${string}`;
  costUsdUpperBound: number;
};

export async function runSwapTask(opts: {
  account: Account;
  config: RuntimeConfig;
  minara: MinaraClient;
  remainingBudgetUsd: number;
}): Promise<TaskResult | null> {
  if (opts.config.tradeChain !== "base") {
    throw new Error(`Unsupported trade chain: ${opts.config.tradeChain}`);
  }

  const intent = opts.config.swapIntentTemplate.replace("{amount}", formatAmount(opts.config.swapAmountUsd));

  const tx = await opts.minara.intentToSwapTx(opts.account.apiKey, {
    intent,
    walletAddress: opts.account.walletAddress,
    chain: "base",
  });

  const unsignedSwapTx = pickUnsignedTx(tx);
  const approvalTx = pickApprovalTx(tx);

  const gasSwapUsd = await estimateGasUsdUpperBound({
    rpcUrl: opts.config.baseRpcUrl,
    from: opts.account.walletAddress,
    tx: unsignedSwapTx,
    nativeUsdPrice: opts.config.nativeUsdPrice,
  });

  const gasApprovalUsd =
    approvalTx == null
      ? 0
      : await estimateGasUsdUpperBound({
          rpcUrl: opts.config.baseRpcUrl,
          from: opts.account.walletAddress,
          tx: approvalTx,
          nativeUsdPrice: opts.config.nativeUsdPrice,
        });

  const variableUsd =
    opts.config.swapAmountUsd * (opts.config.maxFeeRate + opts.config.maxSlippageBps / 10_000);

  const costUsdUpperBound = gasSwapUsd + gasApprovalUsd + variableUsd;

  if (costUsdUpperBound > opts.remainingBudgetUsd) {
    return null;
  }

  const { approvalTxHash, swapTxHash } = await broadcastUnsignedTx({
    rpcUrl: opts.config.baseRpcUrl,
    privateKey: opts.account.eoaPrivateKey,
    approvalTx,
    swapTx: unsignedSwapTx,
  });

  return {
    kind: "swap",
    accountId: opts.account.id,
    approvalTxHash,
    swapTxHash,
    costUsdUpperBound,
  };
}

function pickUnsignedTx(res: IntentToSwapTxResponse): UnsignedTx {
  const tx = res.unsignedTx as UnsignedTx | undefined;
  if (!tx || typeof tx !== "object") {
    throw new Error("Minara intent-to-swap-tx response missing unsignedTx.");
  }
  if (typeof tx.to !== "string" || !/^0x[a-f0-9]{40}$/i.test(tx.to)) {
    throw new Error("Minara unsignedTx.to is invalid.");
  }
  if (typeof tx.data !== "string" || !/^0x[a-f0-9]*$/i.test(tx.data)) {
    throw new Error("Minara unsignedTx.data is invalid.");
  }
  return { ...tx, to: tx.to.toLowerCase() as `0x${string}`, data: tx.data as `0x${string}` };
}

function pickApprovalTx(res: IntentToSwapTxResponse): UnsignedTx | null {
  const approval = res.approval as any;
  if (!approval || typeof approval !== "object") return null;
  const tx = approval.unsignedTx as UnsignedTx | undefined;
  if (!tx) return null;
  if (typeof tx.to !== "string" || !/^0x[a-f0-9]{40}$/i.test(tx.to)) return null;
  if (typeof tx.data !== "string" || !/^0x[a-f0-9]*$/i.test(tx.data)) return null;
  return { ...tx, to: tx.to.toLowerCase() as `0x${string}`, data: tx.data as `0x${string}` };
}

function formatAmount(amount: number): string {
  const s = amount.toFixed(6);
  return s.replace(/\.?0+$/, "");
}
