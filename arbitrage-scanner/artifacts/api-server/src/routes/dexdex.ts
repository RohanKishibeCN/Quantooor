import { Router, type IRouter, type Response } from "express";
import { formatUnits, parseUnits } from "viem";
import { getDexDexPoolRegistry, getDexDexQuoteEngine } from "../lib/dexdexRuntime";
import { getDexDexLatestOpportunities } from "../lib/dexdexOpportunityEngine";

type Address = `0x${string}`;

function parseEnvInt(name: string, defaultValue: number, opts?: { min?: number; max?: number }): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return defaultValue;
  if (opts?.min != null && n < opts.min) return defaultValue;
  if (opts?.max != null && n > opts.max) return defaultValue;
  return n;
}

function toLowerAddress(addr: string): Address | null {
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) return null;
  return addr.toLowerCase() as Address;
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString(10);
  return value;
}

function sendJson(res: Response, data: unknown) {
  res.type("json").send(JSON.stringify(data, jsonReplacer));
}

function parseAmountInUsdc(raw: unknown, usdcDecimals: number): bigint | null {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw < 0) return null;
    return parseUnits(raw.toFixed(usdcDecimals), usdcDecimals);
  }

  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return null;
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    return parseUnits(s, usdcDecimals);
  }

  return null;
}

const router: IRouter = Router();

router.get("/v1/dexdex/pools", (req, res) => {
  try {
    const tokenAddressRaw = (req.query.tokenAddress as string | undefined)?.trim();
    const registry = getDexDexPoolRegistry();
    const snapshot = registry.snapshot();

    if (tokenAddressRaw) {
      const token = toLowerAddress(tokenAddressRaw);
      if (!token) {
        res.status(400).json({ error: "tokenAddress must be a valid 0x address" });
        return;
      }
      res.json({ [token]: snapshot[token] ?? [] });
      return;
    }

    res.json(snapshot);
  } catch (err) {
    req.log.error({ err }, "Error fetching dexdex pools");
    res.status(503).json({ error: "DEXDEX runtime not available" });
  }
});

router.post("/v1/dexdex/quote", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const poolAddress = typeof body.poolAddress === "string" ? toLowerAddress(body.poolAddress) : null;
  const protocol = typeof body.protocol === "string" ? body.protocol : null;
  const tokenIn = typeof body.tokenIn === "string" ? toLowerAddress(body.tokenIn) : null;
  const tokenOut = typeof body.tokenOut === "string" ? toLowerAddress(body.tokenOut) : null;

  const usdcDecimals = parseEnvInt("DEXDEX_USDC_DECIMALS", 6, { min: 0, max: 18 });
  const amountIn = parseAmountInUsdc(body.amountIn, usdcDecimals);

  if (!poolAddress) {
    res.status(400).json({ error: "poolAddress is required and must be a valid 0x address" });
    return;
  }
  if (protocol !== "uniswap-v2" && protocol !== "uniswap-v3") {
    res.status(400).json({ error: "protocol must be one of: uniswap-v2 | uniswap-v3" });
    return;
  }
  if (!tokenIn) {
    res.status(400).json({ error: "tokenIn is required and must be a valid 0x address" });
    return;
  }
  if (!tokenOut) {
    res.status(400).json({ error: "tokenOut is required and must be a valid 0x address" });
    return;
  }
  if (amountIn == null) {
    res.status(400).json({ error: "amountIn is required and must be a USDC amount (string or number)" });
    return;
  }

  try {
    const quoteEngine = getDexDexQuoteEngine();
    const quote = await quoteEngine.quoteExactIn({
      pool: { poolAddress, protocol },
      tokenIn,
      tokenOut,
      amountIn,
    });
    sendJson(res, quote);
  } catch (err) {
    req.log.error({ err }, "Error fetching dexdex quote");
    res.status(503).json({ error: "DEXDEX quote engine not available" });
  }
});

router.get("/v1/dexdex/opportunities", (req, res) => {
  const minNetProfitUsd = Number.parseFloat((req.query.minNetProfitUsd as string) || "0");
  const limit = Math.min(Number.parseInt((req.query.limit as string) || "50", 10), 200);
  const usdcDecimals = parseEnvInt("DEXDEX_USDC_DECIMALS", 6, { min: 0, max: 18 });

  try {
    const opportunities = getDexDexLatestOpportunities()
      .filter((o) => o.netProfitUsd >= (Number.isFinite(minNetProfitUsd) ? minNetProfitUsd : 0))
      .slice(0, Number.isFinite(limit) ? limit : 50);

    const wire = opportunities.map((o) => {
      const liquidityUsd = Math.min(o.buyPool.liquidityUsd, o.sellPool.liquidityUsd);
      const buyImpactBps = o.priceImpactBps.buy;
      const sellImpactBps = o.priceImpactBps.sell;
      const priceImpactBps =
        buyImpactBps == null && sellImpactBps == null ? null : Math.max(buyImpactBps ?? 0, sellImpactBps ?? 0);

      const amountIn = o.amountInUsdc.toString(10);
      const amountOut = o.amountUsdcBack.toString(10);
      const amountInUsd = Number(formatUnits(o.amountInUsdc, usdcDecimals));
      const amountOutUsd = Number(formatUnits(o.amountUsdcBack, usdcDecimals));

      return {
        ...o,
        amountIn,
        amountOut,
        amountInUsd: Number.isFinite(amountInUsd) ? amountInUsd : 0,
        amountOutUsd: Number.isFinite(amountOutUsd) ? amountOutUsd : 0,
        netProfitUsd: o.netProfitUsd,
        liquidityUsd,
        liquidity: liquidityUsd,
        priceImpactBps,
        priceImpact: priceImpactBps,
      };
    });

    sendJson(res, wire);
  } catch (err) {
    req.log.error({ err }, "Error fetching dexdex opportunities");
    res.status(503).json({ error: "DEXDEX opportunity engine not available" });
  }
});

export default router;
