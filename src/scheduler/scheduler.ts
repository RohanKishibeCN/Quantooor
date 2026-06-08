import { randomInt } from "node:crypto";
import type { Account } from "../accounts/store.js";
import type { RuntimeConfig } from "../config/runtime.js";
import { MinaraClient } from "../minara/client.js";
import { runSwapTask } from "./tasks.js";
import { getAccountState, isoDate, type RuntimeState } from "./state.js";

export type SchedulerStatus = {
  now: string;
  totalAccounts: number;
  enabledAccounts: number;
  readyAccounts: number;
  running: number;
  succeededLastHour: number;
  failedLastHour: number;
  circuitOpenAccounts: number;
};

type Event = { t: number; ok: boolean };

export class Scheduler {
  private readonly config: RuntimeConfig;
  private readonly minara: MinaraClient;
  private accounts: Account[];
  private state: RuntimeState;
  private readonly statePath: string;
  private running = 0;
  private timer: NodeJS.Timeout | null = null;
  private events: Event[] = [];

  constructor(opts: {
    config: RuntimeConfig;
    minara: MinaraClient;
    accounts: Account[];
    state: RuntimeState;
    statePath: string;
  }) {
    this.config = opts.config;
    this.minara = opts.minara;
    this.accounts = opts.accounts;
    this.state = opts.state;
    this.statePath = opts.statePath;
  }

  start(onPersist: () => Promise<void>) {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.tick(onPersist).catch(() => undefined);
    }, 2_000);
    this.tick(onPersist).catch(() => undefined);
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  async reloadAccounts(nextAccounts: Account[]) {
    this.accounts = nextAccounts;
  }

  setState(state: RuntimeState) {
    this.state = state;
  }

  getStatus(now = new Date()): SchedulerStatus {
    const enabled = this.accounts.filter((a) => a.enabled).length;
    const ready = this.getReadyAccounts(now).length;
    const lastHour = now.getTime() - 60 * 60_000;
    this.events = this.events.filter((e) => e.t >= lastHour);
    const succeededLastHour = this.events.filter((e) => e.ok).length;
    const failedLastHour = this.events.filter((e) => !e.ok).length;
    const circuitOpenAccounts = this.accounts.filter((a) => this.isCircuitOpen(a.id, now)).length;

    return {
      now: now.toISOString(),
      totalAccounts: this.accounts.length,
      enabledAccounts: enabled,
      readyAccounts: ready,
      running: this.running,
      succeededLastHour,
      failedLastHour,
      circuitOpenAccounts,
    };
  }

  private async tick(onPersist: () => Promise<void>) {
    if (this.running >= this.config.globalConcurrency) return;

    const now = new Date();
    const ready = this.getReadyAccounts(now);
    if (ready.length === 0) return;

    const pick = ready[randomInt(ready.length)];
    this.running += 1;

    try {
      await this.runForAccount(pick, now);
      this.events.push({ t: Date.now(), ok: true });
    } catch {
      this.markFailure(pick.id, now);
      this.events.push({ t: Date.now(), ok: false });
    } finally {
      this.running -= 1;
      await onPersist();
    }
  }

  private getReadyAccounts(now: Date): Account[] {
    return this.accounts.filter((a) => {
      if (!a.enabled) return false;
      if (this.isCircuitOpen(a.id, now)) return false;

      const st = getAccountState(this.state, a.id, now);

      if (st.tradesToday >= this.config.swapPerAccountPerDay) return false;
      if (st.dailySpentUsd >= this.config.dailyMaxCostUsd) return false;

      const scheduleAt = computeDailyScheduleAt(a.id, now, this.config.jitterMaxMs);
      if (now.getTime() < scheduleAt) return false;

      return true;
    });
  }

  private isCircuitOpen(accountId: string, now: Date): boolean {
    const st = getAccountState(this.state, accountId, now);
    if (!st.circuitOpenUntil) return false;
    return now.getTime() < Date.parse(st.circuitOpenUntil);
  }

  private async runForAccount(account: Account, now: Date) {
    const st = getAccountState(this.state, account.id, now);
    const remaining = Math.max(0, this.config.dailyMaxCostUsd - st.dailySpentUsd);

    const result = await runSwapTask({
      account,
      config: this.config,
      minara: this.minara,
      remainingBudgetUsd: remaining,
    });

    if (result == null) return;

    st.lastTradeAt = new Date().toISOString();
    st.tradesToday += 1;
    st.dailySpentUsd += result.costUsdUpperBound;
    st.consecutiveFailures = 0;
    st.circuitOpenUntil = null;
    st.lastErrorAt = null;
  }

  markFailure(accountId: string, now: Date) {
    const st = getAccountState(this.state, accountId, now);
    st.consecutiveFailures += 1;
    st.lastErrorAt = now.toISOString();
    const wait = Math.min(
      this.config.circuitBreakerBaseMs * Math.pow(2, st.consecutiveFailures - 1),
      this.config.circuitBreakerMaxMs,
    );
    st.circuitOpenUntil = new Date(now.getTime() + wait).toISOString();
  }

  getStatePath(): string {
    return this.statePath;
  }
}

function computeDailyScheduleAt(accountId: string, now: Date, jitterMaxMs: number): number {
  const date = isoDate(now);
  const seed = `${accountId}:${date}`;
  const offset = jitterMaxMs === 0 ? 0 : fnv1a32(seed) % jitterMaxMs;
  const start = Date.parse(`${date}T00:00:00.000Z`);
  return start + offset;
}

function fnv1a32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
    h >>>= 0;
  }
  return h >>> 0;
}
