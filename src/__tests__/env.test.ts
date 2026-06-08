import test from "node:test";
import assert from "node:assert/strict";
import { parseEnvNumber, parseEnvRequiredNumber, parseEnvBoolean } from "../config/env.js";

test("parseEnvNumber default", () => {
  delete process.env.X_TEST_NUM;
  assert.equal(parseEnvNumber("X_TEST_NUM", 12), 12);
});

test("parseEnvRequiredNumber throws when missing", () => {
  delete process.env.X_TEST_REQ;
  assert.throws(() => parseEnvRequiredNumber("X_TEST_REQ"));
});

test("parseEnvBoolean parses values", () => {
  process.env.X_TEST_BOOL = "true";
  assert.equal(parseEnvBoolean("X_TEST_BOOL", false), true);
  process.env.X_TEST_BOOL = "0";
  assert.equal(parseEnvBoolean("X_TEST_BOOL", true), false);
});
