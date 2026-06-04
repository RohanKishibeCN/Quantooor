import { loadDexDexConfig, type DexDexConfig } from "./dexdex";
import { parseEnvFlag } from "./env";

export interface ScannerFlags {
  dexdex: boolean;
  dexIngestion: boolean;
  cexIngestion: boolean;
  gateScanner: boolean;
  currencyInfoCache: boolean;
  dexPoolScanner: boolean;
  arbitrageDetection: boolean;
  chainScanner: boolean;
}

export interface RuntimeConfig {
  dexdexMode: boolean;
  scanners: ScannerFlags;
  dexdex?: DexDexConfig;
}

function parseScannerFlag(name: string, defaultValue: boolean): boolean {
  return parseEnvFlag(name, defaultValue);
}

export function loadRuntimeConfig(): RuntimeConfig {
  const dexdexMode = parseEnvFlag("DEXDEX_MODE", false);

  const scanners: ScannerFlags = {
    dexdex: parseScannerFlag("ENABLE_DEXDEX", dexdexMode),
    dexIngestion: parseScannerFlag("ENABLE_DEX_INGESTION", !dexdexMode),
    cexIngestion: parseScannerFlag("ENABLE_CEX_INGESTION", !dexdexMode),
    gateScanner: parseScannerFlag("ENABLE_GATE_SCANNER", !dexdexMode),
    currencyInfoCache: parseScannerFlag("ENABLE_CURRENCY_INFO_CACHE", !dexdexMode),
    dexPoolScanner: parseScannerFlag("ENABLE_DEX_POOL_SCANNER", !dexdexMode),
    arbitrageDetection: parseScannerFlag("ENABLE_ARBITRAGE_DETECTION", !dexdexMode),
    chainScanner: parseScannerFlag("ENABLE_CHAIN_SCANNER", !dexdexMode),
  };

  if (dexdexMode && !scanners.dexdex) {
    throw new Error("DEXDEX_MODE=1 requires ENABLE_DEXDEX=1 (or omit ENABLE_DEXDEX).");
  }

  const dexdex = scanners.dexdex ? loadDexDexConfig() : undefined;

  return { dexdexMode, scanners, dexdex };
}
