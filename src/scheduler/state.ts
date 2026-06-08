import fs from "node:fs/promises";
import path from "node:path";

export type AccountRuntimeState = {
  lastTradeAt: string | null;
  tradesToday: number;
  dailyDate: string;
  dailySpentUsd: number;
  consecutiveFailures: number;
  circuitOpenUntil: string | null;
  lastErrorAt: string | null;
};

export type RuntimeState = {
  v: 1;
  updatedAt: string;
  accounts: Record<string, AccountRuntimeState>;
};

export function defaultAccountState(now: Date): AccountRuntimeState {
  const date = isoDate(now);
  return {
    lastTradeAt: null,
    tradesToday: 0,
    dailyDate: date,
    dailySpentUsd: 0,
    consecutiveFailures: 0,
    circuitOpenUntil: null,
    lastErrorAt: null,
  };
}

export async function loadState(filePath: string): Promise<RuntimeState> {
  const abs = path.resolve(process.cwd(), filePath);
  try {
    const raw = await fs.readFile(abs, "utf8");
    const parsed = JSON.parse(raw) as RuntimeState;
    if (parsed?.v !== 1 || typeof parsed.accounts !== "object") {
      throw new Error("Invalid state file format.");
    }
    return parsed;
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      return { v: 1, updatedAt: new Date().toISOString(), accounts: {} };
    }
    throw err;
  }
}

export async function saveState(filePath: string, state: RuntimeState): Promise<void> {
  const abs = path.resolve(process.cwd(), filePath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  const wire: RuntimeState = { ...state, updatedAt: new Date().toISOString() };
  await fs.writeFile(abs, JSON.stringify(wire, null, 2), "utf8");
}

export function getAccountState(state: RuntimeState, accountId: string, now: Date): AccountRuntimeState {
  const existing = state.accounts[accountId];
  if (!existing) {
    const next = defaultAccountState(now);
    state.accounts[accountId] = next;
    return next;
  }

  const today = isoDate(now);
  if (existing.dailyDate !== today) {
    existing.dailyDate = today;
    existing.tradesToday = 0;
    existing.dailySpentUsd = 0;
  }

  return existing;
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

