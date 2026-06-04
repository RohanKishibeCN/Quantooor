import "../config/dotenv";
import { loadDexDexConfig, type DexDexConfig } from "../config/dexdex";
import { DexDexOpportunityEngine } from "../lib/dexdexOpportunityEngine";
import { getDexDexPoolRegistry, startDexDexRuntime } from "../lib/dexdexRuntime";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForRegistryRefresh(timeoutMs: number): Promise<void> {
  const registry = getDexDexPoolRegistry();
  const startedAt = Date.now();

  while (registry.getLastRefreshAt() == null) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("DEX-DEX pool registry refresh timeout");
    }
    await sleep(250);
  }
}

async function main(): Promise<void> {
  let config: DexDexConfig;
  try {
    config = loadDexDexConfig();
  } catch {
    console.log(
      "跳过：需要设置 DEXDEX_BASE_RPC_URL、DEXDEX_USDC_ADDRESS、DEXDEX_UNIV3_QUOTER_ADDRESS、DEXDEX_TOKEN_ADDRESSES 才能运行 dexdex smoke。",
    );
    return;
  }

  if (!config.tokenAddresses?.length) {
    console.log("跳过：DEXDEX_TOKEN_ADDRESSES 为空或不包含有效地址。");
    return;
  }

  startDexDexRuntime(config);
  await waitForRegistryRefresh(60_000);

  const engine = new DexDexOpportunityEngine(config);
  await engine.refreshOnce();
  const top = engine.getTopN();
  console.log(JSON.stringify(top, null, 2));

  getDexDexPoolRegistry().stop();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
