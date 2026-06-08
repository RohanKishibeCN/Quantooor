import fs from "node:fs/promises";
import path from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { decryptUtf8, type EncryptedPayload } from "./crypto.js";

export type Account = {
  id: string;
  apiKey: string;
  eoaPrivateKey: `0x${string}`;
  walletAddress: `0x${string}`;
  enabled: boolean;
  tags: string[];
};

function assertNonEmptyString(name: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Account field ${name} must be a non-empty string.`);
  }
  return value.trim();
}

function assertBoolean(name: string, value: unknown, defaultValue: boolean): boolean {
  if (value == null) return defaultValue;
  if (typeof value !== "boolean") {
    throw new Error(`Account field ${name} must be a boolean.`);
  }
  return value;
}

function assertStringArray(name: string, value: unknown): string[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    throw new Error(`Account field ${name} must be string[].`);
  }
  return value.map((v) => v.trim()).filter((v) => v.length > 0);
}

function assertPrivateKey(name: string, value: unknown): `0x${string}` {
  const s = assertNonEmptyString(name, value);
  if (!/^0x[a-f0-9]{64}$/i.test(s)) {
    throw new Error(`Account field ${name} must be a 0x-prefixed 32-byte hex private key.`);
  }
  return s.toLowerCase() as `0x${string}`;
}

export async function loadAccounts(opts: {
  accountsFile: string;
  encrypted: boolean;
  masterKey: string;
}): Promise<Account[]> {
  const filePath = path.resolve(process.cwd(), opts.accountsFile);
  const raw = await fs.readFile(filePath, "utf8");

  const jsonText = opts.encrypted
    ? decryptUtf8(JSON.parse(raw) as EncryptedPayload, opts.masterKey)
    : raw;

  const parsed = JSON.parse(jsonText);
  if (!Array.isArray(parsed)) {
    throw new Error("Accounts file must be a JSON array.");
  }

  return parsed.map((row, i) => {
    if (row == null || typeof row !== "object") {
      throw new Error(`Accounts[${i}] must be an object.`);
    }

    const r = row as Record<string, unknown>;
    const id = assertNonEmptyString("id", r.id);
    const apiKey = assertNonEmptyString("apiKey", r.apiKey);
    const eoaPrivateKey = assertPrivateKey("eoaPrivateKey", r.eoaPrivateKey);
    const enabled = assertBoolean("enabled", r.enabled, true);
    const tags = assertStringArray("tags", r.tags);

    const account = privateKeyToAccount(eoaPrivateKey);

    return {
      id,
      apiKey,
      eoaPrivateKey,
      walletAddress: account.address,
      enabled,
      tags,
    };
  });
}
