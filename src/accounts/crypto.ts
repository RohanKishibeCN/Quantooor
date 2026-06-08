import crypto from "node:crypto";

function decodeKey(raw: string): Buffer {
  const s = raw.trim();
  if (/^[a-f0-9]{64}$/i.test(s)) {
    return Buffer.from(s, "hex");
  }

  const b64 = Buffer.from(s, "base64");
  if (b64.length === 32) return b64;

  throw new Error("ACCOUNTS_MASTER_KEY must be 32 bytes (hex-64 or base64).");
}

export type EncryptedPayload = {
  v: 1;
  iv: string;
  tag: string;
  data: string;
};

export function encryptUtf8(plaintext: string, masterKey: string): EncryptedPayload {
  const key = decodeKey(masterKey);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    v: 1,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: enc.toString("base64"),
  };
}

export function decryptUtf8(payload: EncryptedPayload, masterKey: string): string {
  if (payload.v !== 1) {
    throw new Error(`Unsupported encrypted payload version: ${String(payload.v)}`);
  }

  const key = decodeKey(masterKey);
  const iv = Buffer.from(payload.iv, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  const data = Buffer.from(payload.data, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString("utf8");
}

