import type { DexDexConfig } from "../config/dexdex";
import { logger } from "./logger";
import { DexDexPoolRegistry } from "./dexdexPoolRegistry";
import { createDexDexQuoteEngine, type DexDexQuoteEngine } from "./dexdexQuoteEngine";

let poolRegistry: DexDexPoolRegistry | null = null;
let quoteEngine: DexDexQuoteEngine | null = null;

export function startDexDexRuntime(config: DexDexConfig) {
  logger.info(
    {
      baseRpcUrl: config.baseRpcUrl,
      usdcAddress: config.usdcAddress,
      uniV3QuoterAddress: config.uniV3QuoterAddress,
      uniV2FeeBps: config.uniV2FeeBps,
      tokenAddresses: config.tokenAddresses.length,
    },
    "DEX-DEX runtime enabled (Base/USDC)",
  );

  poolRegistry = new DexDexPoolRegistry(config);
  poolRegistry.start();
  quoteEngine = createDexDexQuoteEngine(config);
}

export function getDexDexPoolRegistry(): DexDexPoolRegistry {
  if (!poolRegistry) {
    throw new Error("DEX-DEX pool registry is not initialized. Enable ENABLE_DEXDEX=1 and start the runtime.");
  }
  return poolRegistry;
}

export function getDexDexQuoteEngine(): DexDexQuoteEngine {
  if (!quoteEngine) {
    throw new Error("DEX-DEX quote engine is not initialized. Enable ENABLE_DEXDEX=1 and start the runtime.");
  }
  return quoteEngine;
}
