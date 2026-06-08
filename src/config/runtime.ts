import { parseEnvBoolean, parseEnvNumber, parseEnvRequiredNumber, parseEnvRequiredString, parseEnvString } from "./env.js";

export type TradeChain = "base";

export interface RuntimeConfig {
  serverPort: number;
  adminToken: string | null;
  accountsFile: string;
  accountsFileEncrypted: boolean;
  accountsMasterKey: string;
  tradeChain: TradeChain;
  baseRpcUrl: string;
  dailyMaxCostUsd: number;
  nativeUsdPrice: number;
  maxFeeRate: number;
  maxSlippageBps: number;
  swapIntentTemplate: string;
  swapAmountUsd: number;
  swapPerAccountPerDay: number;
  globalConcurrency: number;
  jitterMaxMs: number;
  circuitBreakerBaseMs: number;
  circuitBreakerMaxMs: number;
}

export function loadRuntimeConfig(): RuntimeConfig {
  const serverPort = parseEnvRequiredNumber("SERVER_PORT", { min: 1, max: 65535, integer: true });
  const adminTokenRaw = parseEnvString("ADMIN_TOKEN", "");
  const adminToken = adminTokenRaw === "" ? null : adminTokenRaw;

  const accountsFile = parseEnvRequiredString("ACCOUNTS_FILE");
  const accountsFileEncrypted = parseEnvBoolean("ACCOUNTS_FILE_ENCRYPTED", true);
  const accountsMasterKey = parseEnvRequiredString("ACCOUNTS_MASTER_KEY");

  const tradeChainRaw = parseEnvString("TRADE_CHAIN", "base");
  if (tradeChainRaw !== "base") {
    throw new Error(`Unsupported TRADE_CHAIN "${tradeChainRaw}". Only "base" is supported in this version.`);
  }

  const baseRpcUrl = parseEnvRequiredString("BASE_RPC_URL");

  const dailyMaxCostUsd = parseEnvNumber("DAILY_MAX_COST_USD", 0.2, { min: 0 });
  const nativeUsdPrice = parseEnvNumber("NATIVE_USD_PRICE", 3000, { min: 0 });
  const maxFeeRate = parseEnvNumber("MAX_FEE_RATE", 0.003, { min: 0, max: 1 });
  const maxSlippageBps = parseEnvNumber("MAX_SLIPPAGE_BPS", 50, { min: 0, max: 10_000, integer: true });

  const swapIntentTemplate = parseEnvString("SWAP_INTENT_TEMPLATE", "swap {amount} USDC to WETH");
  if (!swapIntentTemplate.includes("{amount}")) {
    throw new Error("SWAP_INTENT_TEMPLATE must contain '{amount}' placeholder.");
  }

  const swapAmountUsd = parseEnvNumber("SWAP_AMOUNT_USD", 10, { min: 0 });
  const swapPerAccountPerDay = parseEnvNumber("SWAP_PER_ACCOUNT_PER_DAY", 1, { min: 0, integer: true });

  const globalConcurrency = parseEnvNumber("GLOBAL_CONCURRENCY", 3, { min: 1, max: 20, integer: true });
  const jitterMaxMs = parseEnvNumber("JITTER_MAX_MS", 3_600_000, { min: 0, max: 24 * 60 * 60_000, integer: true });
  const circuitBreakerBaseMs = parseEnvNumber("CIRCUIT_BREAKER_BASE_MS", 300_000, { min: 1_000, integer: true });
  const circuitBreakerMaxMs = parseEnvNumber("CIRCUIT_BREAKER_MAX_MS", 1_800_000, { min: 1_000, integer: true });

  return {
    serverPort,
    adminToken,
    accountsFile,
    accountsFileEncrypted,
    accountsMasterKey,
    tradeChain: "base",
    baseRpcUrl,
    dailyMaxCostUsd,
    nativeUsdPrice,
    maxFeeRate,
    maxSlippageBps,
    swapIntentTemplate,
    swapAmountUsd,
    swapPerAccountPerDay,
    globalConcurrency,
    jitterMaxMs,
    circuitBreakerBaseMs,
    circuitBreakerMaxMs,
  };
}
