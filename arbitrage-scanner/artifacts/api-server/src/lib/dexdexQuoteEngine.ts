import { createPublicClient, formatUnits, http, type Abi, type PublicClient } from "viem";
import { base } from "viem/chains";
import type { DexDexConfig } from "../config/dexdex";
import type { DexDexPoolProtocol } from "./dexdexPoolRegistry";

type Address = `0x${string}`;

export interface QuoteResult {
  chain: string;
  poolAddress: Address;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  amountOut: bigint;
  effectivePrice: string | null;
  feeBps: number;
  priceImpactBps: number | null;
  blockNumber: bigint;
  fetchedAt: Date;
}

export interface QuoteExactInParams {
  pool: { poolAddress: Address; protocol: DexDexPoolProtocol };
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
}

const ERC20_ABI = [
  {
    inputs: [],
    name: "decimals",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const satisfies Abi;

const UNISWAP_V2_PAIR_ABI = [
  {
    inputs: [],
    name: "token0",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "token1",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getReserves",
    outputs: [
      { internalType: "uint112", name: "reserve0", type: "uint112" },
      { internalType: "uint112", name: "reserve1", type: "uint112" },
      { internalType: "uint32", name: "blockTimestampLast", type: "uint32" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const satisfies Abi;

const UNISWAP_V3_POOL_ABI = [
  {
    inputs: [],
    name: "token0",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "token1",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "fee",
    outputs: [{ internalType: "uint24", name: "", type: "uint24" }],
    stateMutability: "view",
    type: "function",
  },
] as const satisfies Abi;

const UNISWAP_V3_QUOTER_ABI = [
  {
    inputs: [
      { internalType: "address", name: "tokenIn", type: "address" },
      { internalType: "address", name: "tokenOut", type: "address" },
      { internalType: "uint24", name: "fee", type: "uint24" },
      { internalType: "uint256", name: "amountIn", type: "uint256" },
      { internalType: "uint160", name: "sqrtPriceLimitX96", type: "uint160" },
    ],
    name: "quoteExactInputSingle",
    outputs: [{ internalType: "uint256", name: "amountOut", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const satisfies Abi;

function normalizeAddress(addr: Address): Address {
  return addr.toLowerCase() as Address;
}

function pow10(n: number): bigint {
  if (!Number.isInteger(n) || n < 0 || n > 77) {
    throw new Error(`Invalid decimals: ${n}`);
  }
  return 10n ** BigInt(n);
}

function mulDiv(a: bigint, b: bigint, denom: bigint): bigint {
  if (denom === 0n) throw new Error("mulDiv denom=0");
  return (a * b) / denom;
}

export function computeV2AmountOut(args: {
  amountIn: bigint;
  reserveIn: bigint;
  reserveOut: bigint;
  feeBps: number;
}): bigint {
  const feeDenom = 10_000n;
  const feeBps = BigInt(args.feeBps);
  const amountInWithFee = args.amountIn * (feeDenom - feeBps);
  const numerator = amountInWithFee * args.reserveOut;
  const denominator = args.reserveIn * feeDenom + amountInWithFee;
  if (denominator === 0n) return 0n;
  return numerator / denominator;
}

function computeRateX18(args: {
  amountOut: bigint;
  amountIn: bigint;
  decimalsIn: number;
  decimalsOut: number;
}): bigint | null {
  if (args.amountIn === 0n) return null;
  const scale = 10n ** 18n;
  const num = args.amountOut * pow10(args.decimalsIn) * scale;
  const den = args.amountIn * pow10(args.decimalsOut);
  if (den === 0n) return null;
  return num / den;
}

function computeUsdcPriceX18(args: {
  usdcAddress: Address;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  amountOut: bigint;
  decimalsIn: number;
  decimalsOut: number;
  usdcDecimals: number;
}): bigint | null {
  const usdc = normalizeAddress(args.usdcAddress);
  const tokenIn = normalizeAddress(args.tokenIn);
  const tokenOut = normalizeAddress(args.tokenOut);
  if (args.amountOut === 0n || args.amountIn === 0n) return null;

  const scale = 10n ** 18n;
  if (tokenIn === usdc) {
    const num = args.amountIn * pow10(args.decimalsOut) * scale;
    const den = args.amountOut * pow10(args.usdcDecimals);
    if (den === 0n) return null;
    return num / den;
  }

  if (tokenOut === usdc) {
    const num = args.amountOut * pow10(args.decimalsIn) * scale;
    const den = args.amountIn * pow10(args.usdcDecimals);
    if (den === 0n) return null;
    return num / den;
  }

  return null;
}

function computePriceImpactBpsFromRates(spotRateX18: bigint | null, effectiveRateX18: bigint | null): number | null {
  if (spotRateX18 == null || effectiveRateX18 == null) return null;
  if (spotRateX18 <= 0n) return null;
  if (effectiveRateX18 >= spotRateX18) return 0;
  const diff = spotRateX18 - effectiveRateX18;
  const bps = mulDiv(diff, 10_000n, spotRateX18);
  if (bps < 0n) return 0;
  if (bps > 10_000n) return 10_000;
  return Number(bps);
}

export class DexDexQuoteEngine {
  private readonly client: PublicClient;
  private readonly usdcAddress: Address;
  private readonly uniV3QuoterAddress: Address;
  private readonly uniV2FeeBps: number;

  private readonly tokenDecimalsCache = new Map<Address, number>();
  private readonly v2PairTokensCache = new Map<Address, { token0: Address; token1: Address }>();
  private readonly v3PoolInfoCache = new Map<Address, { token0: Address; token1: Address; fee: number; feeBps: number }>();

  constructor(config: DexDexConfig) {
    this.client = createPublicClient({ chain: base, transport: http(config.baseRpcUrl) }) as PublicClient;
    this.usdcAddress = normalizeAddress(config.usdcAddress);
    this.uniV3QuoterAddress = normalizeAddress(config.uniV3QuoterAddress);
    this.uniV2FeeBps = config.uniV2FeeBps;
  }

  async quoteExactIn(params: QuoteExactInParams): Promise<QuoteResult> {
    const poolAddress = normalizeAddress(params.pool.poolAddress);
    const tokenIn = normalizeAddress(params.tokenIn);
    const tokenOut = normalizeAddress(params.tokenOut);
    const fetchedAt = new Date();

    const [blockNumber, decimalsIn, decimalsOut, usdcDecimals] = await Promise.all([
      this.client.getBlockNumber(),
      this.getTokenDecimals(tokenIn),
      this.getTokenDecimals(tokenOut),
      this.getTokenDecimals(this.usdcAddress),
    ]);

    if (params.pool.protocol === "uniswap-v2") {
      const { amountOut, feeBps, priceImpactBps } = await this.quoteV2ExactIn({
        poolAddress,
        tokenIn,
        tokenOut,
        amountIn: params.amountIn,
        decimalsIn,
        decimalsOut,
      });

      const effectivePriceX18 = computeUsdcPriceX18({
        usdcAddress: this.usdcAddress,
        tokenIn,
        tokenOut,
        amountIn: params.amountIn,
        amountOut,
        decimalsIn,
        decimalsOut,
        usdcDecimals,
      });

      return {
        chain: "base",
        poolAddress,
        tokenIn,
        tokenOut,
        amountIn: params.amountIn,
        amountOut,
        effectivePrice: effectivePriceX18 == null ? null : formatUnits(effectivePriceX18, 18),
        feeBps,
        priceImpactBps,
        blockNumber,
        fetchedAt,
      };
    }

    if (params.pool.protocol === "uniswap-v3") {
      const { amountOut, feeBps } = await this.quoteV3ExactIn({
        poolAddress,
        tokenIn,
        tokenOut,
        amountIn: params.amountIn,
      });

      const effectivePriceX18 = computeUsdcPriceX18({
        usdcAddress: this.usdcAddress,
        tokenIn,
        tokenOut,
        amountIn: params.amountIn,
        amountOut,
        decimalsIn,
        decimalsOut,
        usdcDecimals,
      });

      return {
        chain: "base",
        poolAddress,
        tokenIn,
        tokenOut,
        amountIn: params.amountIn,
        amountOut,
        effectivePrice: effectivePriceX18 == null ? null : formatUnits(effectivePriceX18, 18),
        feeBps,
        priceImpactBps: null,
        blockNumber,
        fetchedAt,
      };
    }

    throw new Error(`Unsupported pool protocol: ${(params.pool as { protocol: string }).protocol}`);
  }

  private async getTokenDecimals(token: Address): Promise<number> {
    const key = normalizeAddress(token);
    const cached = this.tokenDecimalsCache.get(key);
    if (cached != null) return cached;

    const decimals = await this.client.readContract({
      address: key,
      abi: ERC20_ABI,
      functionName: "decimals",
    });

    const d = Number(decimals);
    this.tokenDecimalsCache.set(key, d);
    return d;
  }

  private async getV2PairTokens(pair: Address): Promise<{ token0: Address; token1: Address }> {
    const key = normalizeAddress(pair);
    const cached = this.v2PairTokensCache.get(key);
    if (cached) return cached;

    const [token0, token1] = await Promise.all([
      this.client.readContract({ address: key, abi: UNISWAP_V2_PAIR_ABI, functionName: "token0" }),
      this.client.readContract({ address: key, abi: UNISWAP_V2_PAIR_ABI, functionName: "token1" }),
    ]);

    const info = { token0: normalizeAddress(token0 as Address), token1: normalizeAddress(token1 as Address) };
    this.v2PairTokensCache.set(key, info);
    return info;
  }

  private async quoteV2ExactIn(args: {
    poolAddress: Address;
    tokenIn: Address;
    tokenOut: Address;
    amountIn: bigint;
    decimalsIn: number;
    decimalsOut: number;
  }): Promise<{ amountOut: bigint; feeBps: number; priceImpactBps: number | null }> {
    const { token0, token1 } = await this.getV2PairTokens(args.poolAddress);
    const reserves = await this.client.readContract({
      address: args.poolAddress,
      abi: UNISWAP_V2_PAIR_ABI,
      functionName: "getReserves",
    });

    const reserve0 = reserves[0] as bigint;
    const reserve1 = reserves[1] as bigint;

    let reserveIn: bigint;
    let reserveOut: bigint;

    if (args.tokenIn === token0 && args.tokenOut === token1) {
      reserveIn = reserve0;
      reserveOut = reserve1;
    } else if (args.tokenIn === token1 && args.tokenOut === token0) {
      reserveIn = reserve1;
      reserveOut = reserve0;
    } else {
      throw new Error("V2 pair tokens do not match tokenIn/tokenOut");
    }

    const amountOut = computeV2AmountOut({
      amountIn: args.amountIn,
      reserveIn,
      reserveOut,
      feeBps: this.uniV2FeeBps,
    });

    const spotRateX18 = computeRateX18({
      amountOut: reserveOut,
      amountIn: reserveIn,
      decimalsIn: args.decimalsIn,
      decimalsOut: args.decimalsOut,
    });

    const effectiveRateX18 = computeRateX18({
      amountOut,
      amountIn: args.amountIn,
      decimalsIn: args.decimalsIn,
      decimalsOut: args.decimalsOut,
    });

    const priceImpactBps = computePriceImpactBpsFromRates(spotRateX18, effectiveRateX18);

    return { amountOut, feeBps: this.uniV2FeeBps, priceImpactBps };
  }

  private async getV3PoolInfo(pool: Address): Promise<{ token0: Address; token1: Address; fee: number; feeBps: number }> {
    const key = normalizeAddress(pool);
    const cached = this.v3PoolInfoCache.get(key);
    if (cached) return cached;

    const [token0, token1, fee] = await Promise.all([
      this.client.readContract({ address: key, abi: UNISWAP_V3_POOL_ABI, functionName: "token0" }),
      this.client.readContract({ address: key, abi: UNISWAP_V3_POOL_ABI, functionName: "token1" }),
      this.client.readContract({ address: key, abi: UNISWAP_V3_POOL_ABI, functionName: "fee" }),
    ]);

    const feeNum = Number(fee);
    const info = {
      token0: normalizeAddress(token0 as Address),
      token1: normalizeAddress(token1 as Address),
      fee: feeNum,
      feeBps: Math.floor(feeNum / 100),
    };
    this.v3PoolInfoCache.set(key, info);
    return info;
  }

  private async quoteV3ExactIn(args: {
    poolAddress: Address;
    tokenIn: Address;
    tokenOut: Address;
    amountIn: bigint;
  }): Promise<{ amountOut: bigint; feeBps: number }> {
    const poolInfo = await this.getV3PoolInfo(args.poolAddress);

    const tokenIn = normalizeAddress(args.tokenIn);
    const tokenOut = normalizeAddress(args.tokenOut);
    const matchesForward = tokenIn === poolInfo.token0 && tokenOut === poolInfo.token1;
    const matchesReverse = tokenIn === poolInfo.token1 && tokenOut === poolInfo.token0;
    if (!matchesForward && !matchesReverse) {
      throw new Error("V3 pool tokens do not match tokenIn/tokenOut");
    }

    const amountOut = await this.client.readContract({
      address: this.uniV3QuoterAddress,
      abi: UNISWAP_V3_QUOTER_ABI,
      functionName: "quoteExactInputSingle",
      args: [tokenIn, tokenOut, poolInfo.fee, args.amountIn, 0n],
    });

    return { amountOut: amountOut as bigint, feeBps: poolInfo.feeBps };
  }
}

export function createDexDexQuoteEngine(config: DexDexConfig): DexDexQuoteEngine {
  return new DexDexQuoteEngine(config);
}
