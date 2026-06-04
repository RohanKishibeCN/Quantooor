import http from "http";
import "./config/dotenv";
import app from "./app";
import { logger } from "./lib/logger";
import { initWebSocketServer } from "./lib/wsServer";
import { startCexIngestion } from "./lib/cexIngestion";
import { startDexIngestion } from "./lib/dexIngestion";
import { startArbitrageDetection } from "./lib/arbitrageDetection";
import { startChainScanner } from "./lib/chainScanner";
import { startGateScanner } from "./lib/gateScanner";
import { startCurrencyInfoCache } from "./lib/currencyInfoCache";
import { startDexPoolScanner } from "./lib/dexPoolScanner";
import { loadRuntimeConfig } from "./config/runtime";
import { startDexDexRuntime } from "./lib/dexdexRuntime";
import { startDexDexOpportunityEngine } from "./lib/dexdexOpportunityEngine";
import { parseEnvRequiredNumber } from "./config/env";

const port = parseEnvRequiredNumber("PORT", { min: 1, integer: true });

const server = http.createServer(app);

initWebSocketServer(server);

const runtimeConfig = loadRuntimeConfig();

server.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  if (runtimeConfig.scanners.dexdex) {
    if (!runtimeConfig.dexdex) {
      throw new Error("DEXDEX scanner enabled but DexDex config was not loaded.");
    }
    startDexDexRuntime(runtimeConfig.dexdex);
    startDexDexOpportunityEngine(runtimeConfig.dexdex);
  }

  if (runtimeConfig.scanners.dexIngestion) {
    startDexIngestion();
  }

  if (runtimeConfig.scanners.cexIngestion) {
    startCexIngestion();
  }

  if (runtimeConfig.scanners.gateScanner) {
    startGateScanner();
  }

  if (runtimeConfig.scanners.currencyInfoCache) {
    startCurrencyInfoCache()
      .catch((err) => logger.error({ err }, "Currency info cache failed to start"))
      .finally(() => {
        if (runtimeConfig.scanners.arbitrageDetection) {
          setTimeout(() => {
            startArbitrageDetection();
          }, 5000);
        }

        if (runtimeConfig.scanners.dexPoolScanner) {
          startDexPoolScanner();
        }
      });
  } else {
    if (runtimeConfig.scanners.arbitrageDetection) {
      setTimeout(() => {
        startArbitrageDetection();
      }, 5000);
    }

    if (runtimeConfig.scanners.dexPoolScanner) {
      startDexPoolScanner();
    }
  }

  if (runtimeConfig.scanners.chainScanner) {
    setTimeout(() => {
      startChainScanner();
    }, 60_000);
  }
});
