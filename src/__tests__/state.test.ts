import test from "node:test";
import assert from "node:assert/strict";
import { getAccountState, type RuntimeState } from "../scheduler/state.js";

test("getAccountState resets daily counters when date changes", () => {
  const state: RuntimeState = { v: 1, updatedAt: new Date().toISOString(), accounts: {} };
  const day1 = new Date("2026-01-01T00:00:00.000Z");
  const st1 = getAccountState(state, "a", day1);
  st1.tradesToday = 1;
  st1.dailySpentUsd = 0.5;
  const day2 = new Date("2026-01-02T00:00:00.000Z");
  const st2 = getAccountState(state, "a", day2);
  assert.equal(st2.tradesToday, 0);
  assert.equal(st2.dailySpentUsd, 0);
});
