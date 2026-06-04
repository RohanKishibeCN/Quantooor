import type { DexDexConfig } from "../config/dexdex";
import { logger } from "./logger";

const DEXSCREENER_BASE = "https://api.dexscreener.com";

type Address = `0x${string}`;

interface DsPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  url?: string;
  baseToken: { address: string; symbol: string };
  quoteToken: { address?: string; symbol: string };
  priceUsd?: string | null;
  liquidity?: { usd?: number | null };
  volume?: { h24?: number | null };
  txns?: { h24?: { buys?: number | null; sells?: number | null } | null };
}

export type DexDexPoolProtocol = "uniswap-v2" | "uniswap-v3";

export interface DexDexPoolCandidate {
  tokenAddress: Address;
  usdcAddress: Address;
  poolAddress: Address;
  dexId: string;
  protocol: DexDexPoolProtocol;
  tokenSide: "base" | "quote";
  liquidityUsd: number;
  volume24h: number;
  txns24h: number;
  url?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function toLowerAddress(addr: string): Address | null {
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) return null;
  return addr.toLowerCase() as Address;
}

function isAllowedDex(dexId: string, allowlist: Set<string>): boolean {
  const id = dexId.toLowerCase();
  if (allowlist.has(id)) return true;
  if (allowlist.has("uniswap") && id.includes("uniswap")) return true;
  return false;
}

function inferProtocol(dexId: string): DexDexPoolProtocol {
  return dexId.toLowerCase().includes("v3") ? "uniswap-v3" : "uniswap-v2";
}

function normalizeCandidate(
  pair: DsPair,
  usdcAddressLower: Address,
  allowlist: Set<string>,
): DexDexPoolCandidate | null {
  if (pair.chainId.toLowerCase() !== "base") return null;
  if (!isAllowedDex(pair.dexId, allowlist)) return null;

  const baseAddr = toLowerAddress(pair.baseToken.address);
  const quoteAddr = pair.quoteToken.address ? toLowerAddress(pair.quoteToken.address) : null;
  if (!baseAddr || !quoteAddr) return null;

  const usdcIsBase = baseAddr === usdcAddressLower;
  const usdcIsQuote = quoteAddr === usdcAddressLower;
  if (!usdcIsBase && !usdcIsQuote) return null;

  const tokenAddress = usdcIsBase ? quoteAddr : baseAddr;
  if (tokenAddress === usdcAddressLower) return null;

  const poolAddress = toLowerAddress(pair.pairAddress);
  if (!poolAddress) return null;

  const liquidityUsd = pair.liquidity?.usd == null ? 0 : Number(pair.liquidity.usd);
  const volume24h = pair.volume?.h24 == null ? 0 : Number(pair.volume.h24);
  const buys = pair.txns?.h24?.buys == null ? 0 : Number(pair.txns.h24.buys);
  const sells = pair.txns?.h24?.sells == null ? 0 : Number(pair.txns.h24.sells);
  const txns24h = buys + sells;

  return {
    tokenAddress,
    usdcAddress: usdcAddressLower,
    poolAddress,
    dexId: pair.dexId,
    protocol: inferProtocol(pair.dexId),
    tokenSide: usdcIsBase ? "quote" : "base",
    liquidityUsd,
    volume24h,
    txns24h,
    url: pair.url,
  };
}

async function fetchDexScreenerBaseTokens(batch: Address[]): Promise<DsPair[]> {
  const url = `${DEXSCREENER_BASE}/tokens/v1/base/${batch.join(",")}`;

  try {
    const resp = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) return [];
    const data = (await resp.json()) as DsPair[] | { pairs: DsPair[] | null };
    if (Array.isArray(data)) return data;
    if (data && "pairs" in data && Array.isArray(data.pairs)) return data.pairs;
    return [];
  } catch {
    return [];
  }
}

function sortCandidates(a: DexDexPoolCandidate, b: DexDexPoolCandidate): number {
  if (b.liquidityUsd !== a.liquidityUsd) return b.liquidityUsd - a.liquidityUsd;
  if (b.txns24h !== a.txns24h) return b.txns24h - a.txns24h;
  return b.volume24h - a.volume24h;
}

function uniqByPool(cands: DexDexPoolCandidate[]): DexDexPoolCandidate[] {
  const seen = new Set<string>();
  const out: DexDexPoolCandidate[] = [];

  for (const c of cands) {
    const key = `${c.poolAddress}:${c.protocol}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }

  return out;
}

export class DexDexPoolRegistry {
  private readonly tokenAddresses: Address[];
  private readonly tokenSet: Set<Address>;
  private readonly usdcAddress: Address;
  private readonly allowlist: Set<string>;
  private readonly topN: number;
  private readonly refreshMs: number;
  private readonly batchSize: number;
  private readonly batchSleepMs: number;

  private readonly poolsByToken: Map<Address, DexDexPoolCandidate[]> = new Map();
  private refreshTimer: NodeJS.Timeout | null = null;
  private refreshing = false;
  private lastRefreshAt: Date | null = null;

  constructor(config: DexDexConfig) {
    this.tokenAddresses = config.tokenAddresses.map((a) => a.toLowerCase() as Address);
    this.tokenSet = new Set(this.tokenAddresses);
    this.usdcAddress = config.usdcAddress.toLowerCase() as Address;
    this.allowlist = new Set(config.dexAllowlist.map((s) => s.toLowerCase()));
    this.topN = config.poolRegistryTopN;
    this.refreshMs = config.poolRegistryRefreshMs;
    this.batchSize = config.poolRegistryBatchSize;
    this.batchSleepMs = config.poolRegistryBatchSleepMs;
  }

  start(): void {
    if (this.refreshTimer) return;

    if (this.tokenAddresses.length === 0) {
      logger.warn("DEX-DEX pool registry started with empty DEXDEX_TOKEN_ADDRESSES.");
    }

    this.refresh().catch((err) => logger.warn({ err }, "DEX-DEX pool registry initial refresh failed"));
    this.refreshTimer = setInterval(() => {
      this.refresh().catch((err) => logger.warn({ err }, "DEX-DEX pool registry refresh failed"));
    }, this.refreshMs);
  }

  stop(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = null;
  }

  getCandidates(tokenAddress: Address): DexDexPoolCandidate[] {
    const key = (tokenAddress.toLowerCase() as Address) ?? tokenAddress;
    return (this.poolsByToken.get(key) ?? []).slice();
  }

  snapshot(): Record<Address, DexDexPoolCandidate[]> {
    const out: Record<Address, DexDexPoolCandidate[]> = {} as Record<Address, DexDexPoolCandidate[]>;
    for (const [k, v] of this.poolsByToken.entries()) {
      out[k] = v.slice();
    }
    return out;
  }

  getLastRefreshAt(): Date | null {
    return this.lastRefreshAt;
  }

  private async refresh(): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;

    try {
      const tokens = this.tokenAddresses;
      const nextPools = new Map<Address, DexDexPoolCandidate[]>();

      const batches: Address[][] = [];
      for (let i = 0; i < tokens.length; i += this.batchSize) {
        batches.push(tokens.slice(i, i + this.batchSize));
      }

      for (const batch of batches) {
        const pairs = await fetchDexScreenerBaseTokens(batch);

        for (const pair of pairs) {
          const cand = normalizeCandidate(pair, this.usdcAddress, this.allowlist);
          if (!cand) continue;
          if (!this.tokenSet.has(cand.tokenAddress)) continue;

          if (!nextPools.has(cand.tokenAddress)) nextPools.set(cand.tokenAddress, []);
          nextPools.get(cand.tokenAddress)!.push(cand);
        }

        if (this.batchSleepMs > 0 && batch !== batches[batches.length - 1]) {
          await sleep(this.batchSleepMs);
        }
      }

      let totalPools = 0;

      for (const token of tokens) {
        const pools = uniqByPool(nextPools.get(token) ?? [])
          .sort(sortCandidates)
          .slice(0, this.topN);
        this.poolsByToken.set(token, pools);
        totalPools += pools.length;
      }

      this.lastRefreshAt = new Date();
      logger.info(
        {
          tokens: tokens.length,
          totalPools,
          topN: this.topN,
          refreshMs: this.refreshMs,
        },
        "DEX-DEX pool registry refreshed (Base/USDC)",
      );
    } finally {
      this.refreshing = false;
    }
  }
}
