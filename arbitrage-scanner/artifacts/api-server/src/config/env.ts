export function parseEnvFlag(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return defaultValue;

  const v = raw.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(v)) return true;
  if (["0", "false", "no", "n", "off"].includes(v)) return false;

  throw new Error(`Invalid boolean env var ${name}: "${raw}"`);
}

export function parseEnvNumber(
  name: string,
  defaultValue: number,
  opts?: { min?: number; max?: number; integer?: boolean },
): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return defaultValue;

  const n = Number(raw);
  if (Number.isNaN(n) || !Number.isFinite(n)) {
    throw new Error(`Invalid number env var ${name}: "${raw}"`);
  }

  if (opts?.integer && !Number.isInteger(n)) {
    throw new Error(`Env var ${name} must be an integer, got "${raw}"`);
  }

  if (opts?.min != null && n < opts.min) {
    throw new Error(`Env var ${name} must be >= ${opts.min}, got "${raw}"`);
  }

  if (opts?.max != null && n > opts.max) {
    throw new Error(`Env var ${name} must be <= ${opts.max}, got "${raw}"`);
  }

  return n;
}

export function parseEnvRequiredNumber(
  name: string,
  opts?: { min?: number; max?: number; integer?: boolean },
): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") {
    throw new Error(`Env var ${name} is required but was not provided.`);
  }
  return parseEnvNumber(name, Number.NaN, opts);
}

export function parseEnvUrl(name: string, defaultValue: string): string {
  const raw = process.env[name];
  const value = raw == null || raw.trim() === "" ? defaultValue : raw.trim();

  try {
    const u = new URL(value);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      throw new Error("protocol must be http or https");
    }
  } catch (err) {
    throw new Error(`Invalid URL env var ${name}: "${value}"`);
  }

  return value;
}

export function parseEnvRequiredUrl(name: string): string {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") {
    throw new Error(`Env var ${name} is required but was not provided.`);
  }
  return parseEnvUrl(name, raw.trim());
}

export function parseEnvAddress(
  name: string,
  defaultValue?: `0x${string}`,
): `0x${string}` {
  const raw = process.env[name];
  const value = raw == null || raw.trim() === "" ? defaultValue : (raw.trim() as `0x${string}`);

  if (!value) {
    throw new Error(`Env var ${name} is required but was not provided.`);
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`Invalid EVM address env var ${name}: "${value}"`);
  }

  return value;
}

export function parseEnvCsv(
  name: string,
  defaultValue: string[] = [],
): string[] {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return defaultValue;

  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function parseEnvAddressList(
  name: string,
  defaultValue: `0x${string}`[] = [],
): `0x${string}`[] {
  const values = parseEnvCsv(name, defaultValue.map((v) => String(v))) as `0x${string}`[];

  for (const v of values) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(v)) {
      throw new Error(`Invalid EVM address in env var ${name}: "${v}"`);
    }
  }

  return values;
}
