import fs from "node:fs/promises";
import path from "node:path";
import { encryptUtf8 } from "../accounts/crypto.js";
import { parseEnvRequiredString } from "../config/env.js";

const inPath = argValue("--in");
const outPath = argValue("--out");

if (!inPath || !outPath) {
  throw new Error("Usage: pnpm accounts:encrypt --in <accounts.json> --out <accounts.enc>");
}

const masterKey = parseEnvRequiredString("ACCOUNTS_MASTER_KEY");

const absIn = path.resolve(process.cwd(), inPath);
const absOut = path.resolve(process.cwd(), outPath);

const plaintext = await fs.readFile(absIn, "utf8");
const payload = encryptUtf8(plaintext, masterKey);

await fs.writeFile(absOut, JSON.stringify(payload, null, 2), "utf8");

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  const v = process.argv[idx + 1];
  return v ? v.trim() : null;
}
