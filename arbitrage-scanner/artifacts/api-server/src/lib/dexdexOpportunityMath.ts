import { formatUnits } from "viem";
import type { QuoteResult } from "./dexdexQuoteEngine";

export function computeDexDexNetProfitUsd(args: {
  buy: QuoteResult;
  sell: QuoteResult;
  usdcDecimals: number;
  gasUsd: number;
}): { grossProfitUsd: number; netProfitUsd: number } {
  const diff = args.sell.amountOut - args.buy.amountIn;
  const grossProfitUsd = Number(formatUnits(diff, args.usdcDecimals));
  const gross = Number.isFinite(grossProfitUsd) ? grossProfitUsd : 0;
  return { grossProfitUsd: gross, netProfitUsd: gross - args.gasUsd };
}

