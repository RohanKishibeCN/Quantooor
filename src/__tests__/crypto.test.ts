import test from "node:test";
import assert from "node:assert/strict";
import { decryptUtf8, encryptUtf8 } from "../accounts/crypto.js";

test("encryptUtf8/decryptUtf8 roundtrip", () => {
  const key = Buffer.alloc(32, 7).toString("base64");
  const input = JSON.stringify({ a: 1, b: "x" });
  const enc = encryptUtf8(input, key);
  const dec = decryptUtf8(enc, key);
  assert.equal(dec, input);
});
