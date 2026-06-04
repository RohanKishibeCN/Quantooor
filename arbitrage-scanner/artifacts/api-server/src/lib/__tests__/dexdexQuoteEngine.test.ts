import assert from "node:assert/strict";
import test from "node:test";
import { computeV2AmountOut } from "../dexdexQuoteEngine";

test("UniswapV2 exact-in 报价公式：不同 reserves/feeBps", () => {
  assert.equal(
    computeV2AmountOut({ amountIn: 1000n, reserveIn: 10000n, reserveOut: 10000n, feeBps: 30 }),
    906n,
  );

  assert.equal(
    computeV2AmountOut({ amountIn: 1_000_000n, reserveIn: 500_000_000n, reserveOut: 2_000_000_000n, feeBps: 10 }),
    3_988_031n,
  );

  assert.equal(
    computeV2AmountOut({ amountIn: 5_000_000n, reserveIn: 1_000_000n, reserveOut: 50_000_000n, feeBps: 100 }),
    41_596_638n,
  );
});

