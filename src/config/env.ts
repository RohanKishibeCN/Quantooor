export function parseEnvString(name: string, defaultValue: string): string {
  const raw = process.env[name];
  return raw == null || raw.trim() === "" ? defaultValue : raw.trim();
}

export function parseEnvRequiredString(name: string): string {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") {
    throw new Error(`Env var ${name} is required but was not provided.`);
  }
  return raw.trim();
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

export function parseEnvBoolean(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return defaultValue;

  const v = raw.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(v)) return true;
  if (["0", "false", "no", "n", "off"].includes(v)) return false;
  throw new Error(`Invalid boolean env var ${name}: "${raw}"`);
}

