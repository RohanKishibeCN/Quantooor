import "./config/dotenv.js";
import { loadRuntimeConfig } from "./config/runtime.js";
import { loadAccounts } from "./accounts/store.js";
import { MinaraClient } from "./minara/client.js";
import { createHttpServer } from "./server/http.js";
import { Scheduler } from "./scheduler/scheduler.js";
import { loadState, saveState } from "./scheduler/state.js";

const config = loadRuntimeConfig();

const minara = new MinaraClient();
const statePath = "./state/state.json";

let accounts = await loadAccounts({
  accountsFile: config.accountsFile,
  encrypted: config.accountsFileEncrypted,
  masterKey: config.accountsMasterKey,
});

let state = await loadState(statePath);

const scheduler = new Scheduler({
  config,
  minara,
  accounts,
  state,
  statePath,
});

const persist = createPersister(async () => {
  await saveState(statePath, state);
});

const server = createHttpServer({
  port: config.serverPort,
  scheduler,
  adminToken: config.adminToken,
  onReload: async () => {
    accounts = await loadAccounts({
      accountsFile: config.accountsFile,
      encrypted: config.accountsFileEncrypted,
      masterKey: config.accountsMasterKey,
    });
    await scheduler.reloadAccounts(accounts);
  },
});

await server.listen();

scheduler.start(async () => {
  await persist();
});

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

async function shutdown(signal: string) {
  try {
    scheduler.stop();
    await persist.flush();
    await server.close();
  } finally {
    process.exit(0);
  }
}

function createPersister(fn: () => Promise<void>) {
  let pending: Promise<void> | null = null;
  let queued = false;

  const run = async () => {
    pending = fn()
      .catch(() => undefined)
      .finally(() => {
        pending = null;
      });
    await pending;
    if (queued) {
      queued = false;
      await run();
    }
  };

  const trigger = async () => {
    if (pending) {
      queued = true;
      return;
    }
    await run();
  };

  trigger.flush = async () => {
    while (pending || queued) {
      await trigger();
    }
  };

  return trigger as (() => Promise<void>) & { flush: () => Promise<void> };
}
