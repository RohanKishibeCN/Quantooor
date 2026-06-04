import assert from "node:assert/strict";
import test from "node:test";
import { computeDexDexNetProfitUsd } from "../dexdexOpportunityMath";
import type { QuoteResult } from "../dexdexQuoteEngine";

function makeQuote(overrides: Partial<QuoteResult>): QuoteResult {
  return {
    chain: "base",
    poolAddress: "0x0000000000000000000000000000000000000001",
    tokenIn: "0x0000000000000000000000000000000000000002",
    tokenOut: "0x0000000000000000000000000000000000000003",
    amountIn: 0n,
    amountOut: 0n,
    effectivePrice: null,
    feeBps: 30,
    priceImpactBps: null,
    blockNumber: 1n,
    fetchedAt: new Date(0),
    ...overrides,
  };
}

test("DEX-DEX 机会净利润：两腿 QuoteResult + gasUsd -> netProfitUsd", () => {
  const buy = makeQuote({ amountIn: 100_000_000n, amountOut: 1_000n });
  const sell = makeQuote({ amountIn: 1_000n, amountOut: 105_000_000n });

  const res = computeDexDexNetProfitUsd({ buy, sell, usdcDecimals: 6, gasUsd: 0.5 });
  assert.equal(res.grossProfitUsd, 5);
  assert.equal(res.netProfitUsd, 4.5);
});

test("DEX-DEX 机会净利润：亏损场景", () => {
  const buy = makeQuote({ amountIn: 100_000_000n, amountOut: 1_000n });
  const sell = makeQuote({ amountIn: 1_000n, amountOut: 99_000_000n });

  const res = computeDexDexNetProfitUsd({ buy, sell, usdcDecimals: 6, gasUsd: 0.5 });
  assert.equal(res.grossProfitUsd, -1);
  assert.equal(res.netProfitUsd, -1.5);
});

