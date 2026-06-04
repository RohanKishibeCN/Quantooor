import { useQuery } from "@tanstack/react-query";

export type DexDexOpportunity = {
  tokenAddress: string;
  buyDexId: string;
  sellDexId: string;
  buyPoolAddress: string;
  sellPoolAddress: string;
  amountInUsdc: number;
  amountUsdcBack?: number;
  grossProfitUsd?: number;
  netProfitUsd: number;
  netProfitBps?: number;
  buyPriceImpactBps?: number;
  sellPriceImpactBps?: number;
  liquidityUsd?: number;
  priceImpactBps?: number;
  computedAt?: string | number;
};

export const DEXDEX_OPPORTUNITIES_QUERY_KEY = ["dexdex-opportunities", "base-usdc"] as const;

export const DEFAULT_USDC_DECIMALS = 6;

export function parseUsdcAmount(value: unknown, usdcDecimals = DEFAULT_USDC_DECIMALS): number {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const s = value.trim();
    if (s === "") return 0;
    if (s.includes(".") || s.includes("e") || s.includes("E")) {
      const n = Number(s);
      return Number.isFinite(n) ? n : 0;
    }
    try {
      const base = 10n ** BigInt(Math.max(0, Math.min(18, usdcDecimals)));
      const bi = BigInt(s);
      const intPart = bi / base;
      const fracPart = bi % base;
      const frac = fracPart.toString(10).padStart(Number(base.toString(10).length - 1), "0");
      const n = Number(`${intPart.toString(10)}.${frac}`);
      return Number.isFinite(n) ? n : 0;
    } catch {
      const n = Number(s);
      return Number.isFinite(n) ? n : 0;
    }
  }
  return 0;
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function normalizeDexDexOpportunity(raw: any, usdcDecimals: number): DexDexOpportunity {
  const buyPool = raw?.buyPool;
  const sellPool = raw?.sellPool;

  const buyPriceImpactBps = toFiniteNumber(raw?.priceImpactBps?.buy ?? raw?.buyPriceImpactBps);
  const sellPriceImpactBps = toFiniteNumber(raw?.priceImpactBps?.sell ?? raw?.sellPriceImpactBps);
  const priceImpactBps =
    toFiniteNumber(raw?.priceImpact ?? raw?.priceImpactBps) ??
    (buyPriceImpactBps == null && sellPriceImpactBps == null
      ? undefined
      : Math.max(buyPriceImpactBps ?? 0, sellPriceImpactBps ?? 0));

  const liquidityUsd =
    toFiniteNumber(raw?.liquidity ?? raw?.liquidityUsd) ??
    (() => {
      const buyLiq = toFiniteNumber(buyPool?.liquidityUsd);
      const sellLiq = toFiniteNumber(sellPool?.liquidityUsd);
      if (buyLiq == null && sellLiq == null) return undefined;
      if (buyLiq == null) return sellLiq;
      if (sellLiq == null) return buyLiq;
      return Math.min(buyLiq, sellLiq);
    })();

  return {
    tokenAddress: String(raw?.tokenAddress ?? raw?.token ?? ""),
    buyDexId: String(buyPool?.dexId ?? raw?.buyDexId ?? raw?.dexA ?? raw?.buyDex ?? ""),
    sellDexId: String(sellPool?.dexId ?? raw?.sellDexId ?? raw?.dexB ?? raw?.sellDex ?? ""),
    buyPoolAddress: String(buyPool?.poolAddress ?? raw?.buyPoolAddress ?? raw?.poolA ?? raw?.buyPool ?? ""),
    sellPoolAddress: String(sellPool?.poolAddress ?? raw?.sellPoolAddress ?? raw?.poolB ?? raw?.sellPool ?? ""),
    amountInUsdc: parseUsdcAmount(raw?.amountInUsd ?? raw?.amountInUsdc ?? raw?.amountIn, usdcDecimals),
    amountUsdcBack: parseUsdcAmount(
      raw?.amountOutUsd ?? raw?.amountUsdcBack ?? raw?.amountOutUsdc ?? raw?.amountBack ?? raw?.amountOut,
      usdcDecimals
    ),
    grossProfitUsd: typeof raw?.grossProfitUsd === "number" ? raw.grossProfitUsd : undefined,
    netProfitUsd:
      typeof raw?.netProfitUsd === "number"
        ? raw.netProfitUsd
        : Number.isFinite(Number(raw?.netProfitUsd))
        ? Number(raw?.netProfitUsd)
        : 0,
    netProfitBps: typeof raw?.netProfitBps === "number" ? raw.netProfitBps : undefined,
    buyPriceImpactBps,
    sellPriceImpactBps,
    liquidityUsd,
    priceImpactBps,
    computedAt: raw?.computedAt ?? raw?.time ?? raw?.computed_at,
  };
}

async function fetchDexDexOpportunities(params?: {
  limit?: number;
  minNetProfitUsd?: number;
}): Promise<DexDexOpportunity[]> {
  const search = new URLSearchParams();
  if (params?.limit != null) search.set("limit", String(params.limit));
  if (params?.minNetProfitUsd != null) search.set("minNetProfitUsd", String(params.minNetProfitUsd));

  const url = `/api/v1/dexdex/opportunities${search.size ? `?${search.toString()}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch DEX-DEX opportunities: ${res.status}`);
  }

  const data: unknown = await res.json();
  if (Array.isArray(data)) return data.map((x) => normalizeDexDexOpportunity(x, DEFAULT_USDC_DECIMALS));

  const maybe = data as { opportunities?: unknown };
  if (Array.isArray(maybe?.opportunities)) {
    return maybe.opportunities.map((x) => normalizeDexDexOpportunity(x, DEFAULT_USDC_DECIMALS));
  }

  return [];
}

export function useDexDexOpportunities(params?: { limit?: number; minNetProfitUsd?: number }) {
  const limit = params?.limit ?? 20;
  const minNetProfitUsd = params?.minNetProfitUsd;

  return useQuery({
    queryKey: [...DEXDEX_OPPORTUNITIES_QUERY_KEY, { limit, minNetProfitUsd: minNetProfitUsd ?? null }],
    queryFn: () => fetchDexDexOpportunities({ limit, minNetProfitUsd }),
    refetchInterval: 5000,
  });
}
