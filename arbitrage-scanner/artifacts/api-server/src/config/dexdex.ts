import {
  parseEnvAddress,
  parseEnvAddressList,
  parseEnvCsv,
  parseEnvNumber,
  parseEnvRequiredUrl,
} from "./env";

export interface DexDexConfig {
  baseRpcUrl: string;
  usdcAddress: `0x${string}`;
  uniV3QuoterAddress: `0x${string}`;
  uniV2FeeBps: number;
  tradeAmountUsdc: number;
  minLiquidityUsd: number;
  minNetProfitUsd: number;
  minNetProfitBps: number;
  maxPriceImpactBps: number;
  gasUsd: number;
  tokenAddresses: `0x${string}`[];
  dexAllowlist: string[];
  poolRegistryTopN: number;
  poolRegistryRefreshMs: number;
  poolRegistryBatchSize: number;
  poolRegistryBatchSleepMs: number;
}

export function loadDexDexConfig(): DexDexConfig {
  const baseRpcUrl = parseEnvRequiredUrl("DEXDEX_BASE_RPC_URL");

  const usdcAddress = parseEnvAddress("DEXDEX_USDC_ADDRESS");

  const uniV3QuoterAddress = parseEnvAddress("DEXDEX_UNIV3_QUOTER_ADDRESS");
  const uniV2FeeBps = parseEnvNumber("DEXDEX_UNIV2_FEE_BPS", 30, { min: 0, max: 10_000, integer: true });

  const tradeAmountUsdc = parseEnvNumber("DEXDEX_TRADE_AMOUNT_USDC", 100, { min: 0 });
  const minLiquidityUsd = parseEnvNumber("DEXDEX_MIN_LIQUIDITY_USD", 50_000, { min: 0 });
  const minNetProfitUsd = parseEnvNumber("DEXDEX_MIN_NET_PROFIT_USD", 1, { min: 0 });
  const minNetProfitBps = parseEnvNumber("DEXDEX_MIN_NET_PROFIT_BPS", 5, { min: 0, max: 10_000 });
  const maxPriceImpactBps = parseEnvNumber("DEXDEX_MAX_PRICE_IMPACT_BPS", 100, { min: 0, max: 10_000 });
  const gasUsd = parseEnvNumber("DEXDEX_GAS_USD", 0.5, { min: 0 });

  const tokenAddressesRaw = parseEnvAddressList("DEXDEX_TOKEN_ADDRESSES", []);
  const tokenAddresses = Array.from(
    new Set(
      tokenAddressesRaw
        .map((a) => a.toLowerCase() as `0x${string}`)
        .filter((a) => a !== usdcAddress.toLowerCase()),
    ),
  );

  const dexAllowlist = parseEnvCsv("DEXDEX_DEX_ALLOWLIST", ["uniswap", "uniswap-v2", "uniswap-v3"]).map(
    (s) => s.toLowerCase(),
  );

  const poolRegistryTopN = parseEnvNumber("DEXDEX_POOL_REGISTRY_TOP_N", 5, { min: 1, max: 50, integer: true });
  const poolRegistryRefreshMs = parseEnvNumber("DEXDEX_POOL_REGISTRY_REFRESH_MS", 60_000, {
    min: 5_000,
    max: 24 * 60 * 60_000,
    integer: true,
  });
  const poolRegistryBatchSize = parseEnvNumber("DEXDEX_POOL_REGISTRY_BATCH_SIZE", 30, {
    min: 1,
    max: 30,
    integer: true,
  });
  const poolRegistryBatchSleepMs = parseEnvNumber("DEXDEX_POOL_REGISTRY_BATCH_SLEEP_MS", 250, {
    min: 0,
    max: 60_000,
    integer: true,
  });

  return {
    baseRpcUrl,
    usdcAddress,
    uniV3QuoterAddress,
    uniV2FeeBps,
    tradeAmountUsdc,
    minLiquidityUsd,
    minNetProfitUsd,
    minNetProfitBps,
    maxPriceImpactBps,
    gasUsd,
    tokenAddresses,
    dexAllowlist,
    poolRegistryTopN,
    poolRegistryRefreshMs,
    poolRegistryBatchSize,
    poolRegistryBatchSleepMs,
  };
}
