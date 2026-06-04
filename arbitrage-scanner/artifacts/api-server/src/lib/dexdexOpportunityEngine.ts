import { parseUnits } from "viem";
import type { DexDexConfig } from "../config/dexdex";
import { getDexDexPoolRegistry, getDexDexQuoteEngine } from "./dexdexRuntime";
import type { DexDexPoolCandidate } from "./dexdexPoolRegistry";
import type { QuoteResult } from "./dexdexQuoteEngine";
import { computeDexDexNetProfitUsd } from "./dexdexOpportunityMath";
import { logger } from "./logger";
import { broadcast } from "./wsServer";

type Address = `0x${string}`;

export interface DexDexOpportunity {
  chain: "base";
  tokenAddress: Address;
  usdcAddress: Address;
  buyPool: {
    poolAddress: Address;
    dexId: string;
    protocol: DexDexPoolCandidate["protocol"];
    liquidityUsd: number;
    url?: string;
  };
  sellPool: {
    poolAddress: Address;
    dexId: string;
    protocol: DexDexPoolCandidate["protocol"];
    liquidityUsd: number;
    url?: string;
  };
  amountInUsdc: bigint;
  amountTokenBought: bigint;
  amountUsdcBack: bigint;
  grossProfitUsd: number;
  netProfitUsd: number;
  netProfitBps: number;
  gasUsd: number;
  fee: {
    buyFeeBps: number;
    sellFeeBps: number;
  };
  priceImpactBps: {
    buy: number | null;
    sell: number | null;
  };
  quotes: {
    buy: QuoteResult;
    sell: QuoteResult;
  };
  computedAt: Date;
}

export interface DexDexOpportunitySummary {
  tokenAddress: Address;
  buyDexId: string;
  sellDexId: string;
  buyPoolAddress: Address;
  sellPoolAddress: Address;
  amountInUsdc: string;
  amountUsdcBack: string;
  grossProfitUsd: number;
  netProfitUsd: number;
  netProfitBps: number;
  buyPriceImpactBps: number | null;
  sellPriceImpactBps: number | null;
  liquidityUsd: number;
  computedAt: string;
}

export interface DexDexOpportunityTopN {
  updatedAt: Date | null;
  count: number;
  top: DexDexOpportunitySummary[];
}

function parseEnvInt(name: string, defaultValue: number, opts?: { min?: number; max?: number }): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return defaultValue;
  if (opts?.min != null && n < opts.min) return defaultValue;
  if (opts?.max != null && n > opts.max) return defaultValue;
  return n;
}

function parseEnvCsvLower(name: string): string[] {
  const raw = process.env[name];
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function parseEnvBool(name: string, defaultValue = false): boolean {
  const raw = process.env[name];
  if (raw == null) return defaultValue;
  const v = raw.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return defaultValue;
}

function parseEnvString(name: string, defaultValue: string): string {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const v = raw.trim();
  return v.length > 0 ? v : defaultValue;
}

function normalizeAddress(addr: Address): Address {
  return addr.toLowerCase() as Address;
}

function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  if (limit <= 1) return Promise.all(items.map(fn));
  return new Promise((resolve, reject) => {
    const results: R[] = new Array(items.length);
    let nextIndex = 0;
    let active = 0;

    const pump = () => {
      while (active < limit && nextIndex < items.length) {
        const idx = nextIndex++;
        active++;
        Promise.resolve(fn(items[idx]!))
          .then((res) => {
            results[idx] = res;
            active--;
            if (nextIndex >= items.length && active === 0) resolve(results);
            else pump();
          })
          .catch(reject);
      }
    };

    pump();
  });
}

function formatBigint(amount: bigint): string {
  return amount.toString(10);
}

function toSummary(o: DexDexOpportunity): DexDexOpportunitySummary {
  return {
    tokenAddress: o.tokenAddress,
    buyDexId: o.buyPool.dexId,
    sellDexId: o.sellPool.dexId,
    buyPoolAddress: o.buyPool.poolAddress,
    sellPoolAddress: o.sellPool.poolAddress,
    amountInUsdc: formatBigint(o.amountInUsdc),
    amountUsdcBack: formatBigint(o.amountUsdcBack),
    grossProfitUsd: o.grossProfitUsd,
    netProfitUsd: o.netProfitUsd,
    netProfitBps: o.netProfitBps,
    buyPriceImpactBps: o.priceImpactBps.buy,
    sellPriceImpactBps: o.priceImpactBps.sell,
    liquidityUsd: Math.min(o.buyPool.liquidityUsd, o.sellPool.liquidityUsd),
    computedAt: o.computedAt.toISOString(),
  };
}

function toWireQuote(q: QuoteResult): Record<string, unknown> {
  return {
    chain: q.chain,
    poolAddress: q.poolAddress,
    tokenIn: q.tokenIn,
    tokenOut: q.tokenOut,
    amountIn: q.amountIn.toString(10),
    amountOut: q.amountOut.toString(10),
    effectivePrice: q.effectivePrice,
    feeBps: q.feeBps,
    priceImpactBps: q.priceImpactBps,
    blockNumber: q.blockNumber.toString(10),
    fetchedAt: q.fetchedAt.toISOString(),
  };
}

function toWireOpportunity(o: DexDexOpportunity): Record<string, unknown> {
  return {
    chain: o.chain,
    tokenAddress: o.tokenAddress,
    usdcAddress: o.usdcAddress,
    buyPool: o.buyPool,
    sellPool: o.sellPool,
    amountInUsdc: o.amountInUsdc.toString(10),
    amountTokenBought: o.amountTokenBought.toString(10),
    amountUsdcBack: o.amountUsdcBack.toString(10),
    grossProfitUsd: o.grossProfitUsd,
    netProfitUsd: o.netProfitUsd,
    netProfitBps: o.netProfitBps,
    gasUsd: o.gasUsd,
    fee: o.fee,
    priceImpactBps: o.priceImpactBps,
    quotes: { buy: toWireQuote(o.quotes.buy), sell: toWireQuote(o.quotes.sell) },
    computedAt: o.computedAt.toISOString(),
  };
}

function opportunityKey(o: DexDexOpportunity): string {
  return `${o.tokenAddress}:${o.buyPool.poolAddress}:${o.sellPool.poolAddress}:${o.buyPool.protocol}:${o.sellPool.protocol}`;
}

export class DexDexOpportunityEngine {
  private readonly config: DexDexConfig;
  private readonly refreshMs: number;
  private readonly topN: number;
  private readonly maxPairsPerToken: number;
  private readonly quoteConcurrency: number;
  private readonly usdcDecimals: number;
  private readonly tokenBlacklist: Set<string>;
  private readonly amountInUsdc: bigint;
  private readonly wsPushOpportunity: boolean;
  private readonly wsPushOpportunityTopN: number;
  private readonly wsPushOpportunityMode: "top" | "new";

  private timer: NodeJS.Timeout | null = null;
  private running = false;

  private latest: DexDexOpportunity[] = [];
  private latestTopN: DexDexOpportunityTopN = { updatedAt: null, count: 0, top: [] };
  private lastOpportunityKeys: Set<string> = new Set();

  constructor(config: DexDexConfig) {
    this.config = config;
    this.refreshMs = parseEnvInt("DEXDEX_OPPORTUNITY_REFRESH_MS", 5_000, { min: 1_000, max: 300_000 });
    this.topN = parseEnvInt("DEXDEX_OPPORTUNITY_TOP_N", 20, { min: 1, max: 200 });
    this.maxPairsPerToken = parseEnvInt("DEXDEX_OPPORTUNITY_MAX_PAIRS_PER_TOKEN", 12, { min: 1, max: 200 });
    this.quoteConcurrency = parseEnvInt("DEXDEX_OPPORTUNITY_QUOTE_CONCURRENCY", 6, { min: 1, max: 50 });
    this.usdcDecimals = parseEnvInt("DEXDEX_USDC_DECIMALS", 6, { min: 0, max: 18 });
    this.tokenBlacklist = new Set(parseEnvCsvLower("DEXDEX_TOKEN_BLACKLIST"));
    this.wsPushOpportunity = parseEnvBool("DEXDEX_WS_PUSH_OPPORTUNITY", false);
    this.wsPushOpportunityTopN = parseEnvInt("DEXDEX_WS_PUSH_OPPORTUNITY_TOP_N", 5, { min: 1, max: 200 });
    this.wsPushOpportunityMode = parseEnvString("DEXDEX_WS_PUSH_OPPORTUNITY_MODE", "top") === "new" ? "new" : "top";

    const fixed = Number.isFinite(config.tradeAmountUsdc)
      ? config.tradeAmountUsdc.toFixed(this.usdcDecimals)
      : "0";
    this.amountInUsdc = parseUnits(fixed, this.usdcDecimals);
  }

  start(): void {
    if (this.timer) return;
    this.refresh().catch((err) => logger.warn({ err }, "DEX-DEX opportunity engine initial refresh failed"));
    this.timer = setInterval(() => {
      this.refresh().catch((err) => logger.warn({ err }, "DEX-DEX opportunity engine refresh failed"));
    }, this.refreshMs);
    logger.info(
      {
        refreshMs: this.refreshMs,
        topN: this.topN,
        quoteConcurrency: this.quoteConcurrency,
        tradeAmountUsdc: this.config.tradeAmountUsdc,
        usdcDecimals: this.usdcDecimals,
      },
      "DEX-DEX opportunity engine started (Base/USDC)",
    );
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  getLatestOpportunities(): DexDexOpportunity[] {
    return this.latest.slice();
  }

  getTopN(): DexDexOpportunityTopN {
    return {
      updatedAt: this.latestTopN.updatedAt ? new Date(this.latestTopN.updatedAt) : null,
      count: this.latestTopN.count,
      top: this.latestTopN.top.slice(),
    };
  }

  async refreshOnce(): Promise<void> {
    await this.refresh();
  }

  private async refresh(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const startedAt = Date.now();

    try {
      const registry = getDexDexPoolRegistry();
      const quoteEngine = getDexDexQuoteEngine();

      const usdc = normalizeAddress(this.config.usdcAddress);
      const tokens = this.config.tokenAddresses.map((a) => normalizeAddress(a));

      const tasks: Array<{
        tokenAddress: Address;
        buy: DexDexPoolCandidate;
        sell: DexDexPoolCandidate;
      }> = [];

      for (const tokenAddress of tokens) {
        if (this.tokenBlacklist.has(tokenAddress.toLowerCase())) continue;
        const pools = registry
          .getCandidates(tokenAddress)
          .filter((p) => p.liquidityUsd >= this.config.minLiquidityUsd);
        if (pools.length < 2) continue;

        const pairs: Array<{ a: DexDexPoolCandidate; b: DexDexPoolCandidate; prio: number; liq: number }> = [];
        for (let i = 0; i < pools.length; i++) {
          for (let j = i + 1; j < pools.length; j++) {
            const a = pools[i]!;
            const b = pools[j]!;
            if (a.poolAddress === b.poolAddress) continue;
            const dexDiff = a.dexId.toLowerCase() !== b.dexId.toLowerCase();
            pairs.push({ a, b, prio: dexDiff ? 1 : 0, liq: Math.min(a.liquidityUsd, b.liquidityUsd) });
          }
        }

        pairs.sort((x, y) => {
          if (y.prio !== x.prio) return y.prio - x.prio;
          return y.liq - x.liq;
        });

        const limitedPairs = pairs.slice(0, this.maxPairsPerToken);
        for (const p of limitedPairs) {
          tasks.push({ tokenAddress, buy: p.a, sell: p.b });
          tasks.push({ tokenAddress, buy: p.b, sell: p.a });
        }
      }

      const results = await mapLimit(tasks, this.quoteConcurrency, async (t) => {
        try {
          return await this.evaluateClosedLoop({
            quoteEngine,
            usdcAddress: usdc,
            tokenAddress: t.tokenAddress,
            buyPool: t.buy,
            sellPool: t.sell,
          });
        } catch {
          return null;
        }
      });

      const opportunities = results.filter((x): x is DexDexOpportunity => x != null).sort((a, b) => b.netProfitUsd - a.netProfitUsd);
      this.latest = opportunities;
      this.latestTopN = {
        updatedAt: new Date(),
        count: opportunities.length,
        top: opportunities.slice(0, this.topN).map(toSummary),
      };
      this.pushWs(opportunities);

      logger.info(
        {
          tokens: tokens.length,
          evaluated: tasks.length,
          opportunities: opportunities.length,
          durationMs: Date.now() - startedAt,
          topNetProfitUsd: opportunities.length > 0 ? opportunities[0]!.netProfitUsd : null,
        },
        "DEX-DEX opportunities refreshed (Base/USDC)",
      );
    } finally {
      this.running = false;
    }
  }

  private pushWs(opportunities: DexDexOpportunity[]): void {
    const top = this.getTopN();
    broadcast("dexdex_opportunities_update", {
      updatedAt: top.updatedAt ? top.updatedAt.toISOString() : null,
      count: top.count,
      top: top.top,
    });

    if (!this.wsPushOpportunity) return;

    const nextKeys = new Set<string>();
    for (const o of opportunities) nextKeys.add(opportunityKey(o));

    const selected =
      this.wsPushOpportunityMode === "new"
        ? opportunities.filter((o) => !this.lastOpportunityKeys.has(opportunityKey(o))).slice(0, this.wsPushOpportunityTopN)
        : opportunities.slice(0, this.wsPushOpportunityTopN);

    this.lastOpportunityKeys = nextKeys;

    for (const o of selected) {
      broadcast("dexdex_opportunity", toWireOpportunity(o));
    }
  }

  private async evaluateClosedLoop(args: {
    quoteEngine: ReturnType<typeof getDexDexQuoteEngine>;
    usdcAddress: Address;
    tokenAddress: Address;
    buyPool: DexDexPoolCandidate;
    sellPool: DexDexPoolCandidate;
  }): Promise<DexDexOpportunity | null> {
    const amountInUsdc = this.amountInUsdc;
    if (amountInUsdc <= 0n) return null;

    const buyQuote = await args.quoteEngine.quoteExactIn({
      pool: { poolAddress: args.buyPool.poolAddress, protocol: args.buyPool.protocol },
      tokenIn: args.usdcAddress,
      tokenOut: args.tokenAddress,
      amountIn: amountInUsdc,
    });

    if (buyQuote.amountOut <= 0n) return null;

    const sellQuote = await args.quoteEngine.quoteExactIn({
      pool: { poolAddress: args.sellPool.poolAddress, protocol: args.sellPool.protocol },
      tokenIn: args.tokenAddress,
      tokenOut: args.usdcAddress,
      amountIn: buyQuote.amountOut,
    });

    const amountUsdcBack = sellQuote.amountOut;
    const { grossProfitUsd, netProfitUsd } = computeDexDexNetProfitUsd({
      buy: buyQuote,
      sell: sellQuote,
      usdcDecimals: this.usdcDecimals,
      gasUsd: this.config.gasUsd,
    });
    const netProfitBps =
      this.config.tradeAmountUsdc > 0 ? (netProfitUsd / this.config.tradeAmountUsdc) * 10_000 : 0;

    if (netProfitUsd < this.config.minNetProfitUsd) return null;
    if (netProfitBps < this.config.minNetProfitBps) return null;

    const buyImpact = buyQuote.priceImpactBps;
    const sellImpact = sellQuote.priceImpactBps;
    if (buyImpact != null && buyImpact > this.config.maxPriceImpactBps) return null;
    if (sellImpact != null && sellImpact > this.config.maxPriceImpactBps) return null;

    const computedAt = new Date();

    return {
      chain: "base",
      tokenAddress: args.tokenAddress,
      usdcAddress: args.usdcAddress,
      buyPool: {
        poolAddress: args.buyPool.poolAddress,
        dexId: args.buyPool.dexId,
        protocol: args.buyPool.protocol,
        liquidityUsd: args.buyPool.liquidityUsd,
        url: args.buyPool.url,
      },
      sellPool: {
        poolAddress: args.sellPool.poolAddress,
        dexId: args.sellPool.dexId,
        protocol: args.sellPool.protocol,
        liquidityUsd: args.sellPool.liquidityUsd,
        url: args.sellPool.url,
      },
      amountInUsdc,
      amountTokenBought: buyQuote.amountOut,
      amountUsdcBack,
      grossProfitUsd,
      netProfitUsd,
      netProfitBps,
      gasUsd: this.config.gasUsd,
      fee: { buyFeeBps: buyQuote.feeBps, sellFeeBps: sellQuote.feeBps },
      priceImpactBps: { buy: buyQuote.priceImpactBps, sell: sellQuote.priceImpactBps },
      quotes: { buy: buyQuote, sell: sellQuote },
      computedAt,
    };
  }
}

let engine: DexDexOpportunityEngine | null = null;

export function startDexDexOpportunityEngine(config: DexDexConfig): void {
  if (engine) return;
  engine = new DexDexOpportunityEngine(config);
  engine.start();
}

export function getDexDexOpportunityEngine(): DexDexOpportunityEngine {
  if (!engine) {
    throw new Error("DEX-DEX opportunity engine is not initialized. Enable ENABLE_DEXDEX=1 and start the runtime.");
  }
  return engine;
}

export function getDexDexLatestOpportunities(): DexDexOpportunity[] {
  return getDexDexOpportunityEngine().getLatestOpportunities();
}

export function getDexDexOpportunitiesTopN(): DexDexOpportunityTopN {
  return getDexDexOpportunityEngine().getTopN();
}
