const DEFAULT_TTL_MS = 60 * 60 * 1000;

export function ttlMs(): number {
  const raw = process.env["UNIVERSE_UPDATE_TTL_MS"];
  if (raw !== undefined) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return DEFAULT_TTL_MS;
}

export interface CacheShape {
  readonly latest: string;
  readonly lastCheck: number;
}

export interface UpdateNotice {
  readonly current: string;
  readonly latest: string;
}

export function isDisabled(): boolean {
  const v = process.env["UNIVERSE_NO_UPDATE_CHECK"];
  return v === "1" || v === "true";
}

export function parseCache(raw: string): CacheShape | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("latest" in parsed) ||
    !("lastCheck" in parsed)
  ) {
    return null;
  }
  const { latest, lastCheck } = parsed as {
    latest: unknown;
    lastCheck: unknown;
  };
  if (typeof latest !== "string" || typeof lastCheck !== "number") {
    return null;
  }
  return { latest, lastCheck };
}

// Prerelease ignored ("0.7.0-rc.1" == "0.7.0") so prerelease users
// aren't nagged toward the matching release. Parse failure returns 0.
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (pa === null || pb === null) return 0;
  for (let i = 0; i < 3; i += 1) {
    const ai = pa[i] ?? 0;
    const bi = pb[i] ?? 0;
    if (ai < bi) return -1;
    if (ai > bi) return 1;
  }
  return 0;
}

function parseVersion(s: string): readonly [number, number, number] | null {
  const core = s.split("-")[0] ?? "";
  const parts = core.split(".");
  if (parts.length !== 3) return null;
  const nums = parts.map((p) => Number.parseInt(p, 10));
  if (nums.some((n) => Number.isNaN(n))) return null;
  return [nums[0] as number, nums[1] as number, nums[2] as number] as const;
}

export function useColor(): boolean {
  if (process.env["NO_COLOR"] && process.env["NO_COLOR"].length > 0) {
    return false;
  }
  return process.stderr.isTTY === true;
}

export function paint(s: string, code: string, color: boolean): string {
  if (!color) return s;
  return `\x1b[${code}m${s}\x1b[0m`;
}
