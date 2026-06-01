import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// Opt-out: UNIVERSE_NO_UPDATE_CHECK=1.
// Cache: $XDG_CONFIG_HOME/universe-cli/update-check.json (fallback $HOME/.config/...).

const APP_DIR = "universe-cli";
const CACHE_FILE = "update-check.json";
const PKG_NAME = "@freecodecamp/universe-cli";
const NPM_LATEST_URL = `https://registry.npmjs.org/${PKG_NAME}/latest`;
const TTL_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 3_000;

interface CacheShape {
  readonly latest: string;
  readonly lastCheck: number;
}

export interface UpdateNotice {
  readonly current: string;
  readonly latest: string;
}

function configBase(): string {
  const xdg = process.env["XDG_CONFIG_HOME"];
  if (xdg && xdg.length > 0) return xdg;
  return join(homedir(), ".config");
}

export function cachePath(): string {
  return join(configBase(), APP_DIR, CACHE_FILE);
}

export function isDisabled(): boolean {
  const v = process.env["UNIVERSE_NO_UPDATE_CHECK"];
  return v === "1" || v === "true";
}

function parseCache(raw: string): CacheShape | null {
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

export async function readCache(): Promise<CacheShape | null> {
  try {
    const raw = await readFile(cachePath(), "utf-8");
    return parseCache(raw);
  } catch {
    return null;
  }
}

function readCacheSync(): CacheShape | null {
  try {
    const raw = readFileSync(cachePath(), "utf-8");
    return parseCache(raw);
  } catch {
    return null;
  }
}

async function writeCache(c: CacheShape): Promise<void> {
  const path = cachePath();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify(c), { mode: 0o644 });
}

export async function fetchLatest(): Promise<string | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(NPM_LATEST_URL, {
      signal: ctl.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { version?: unknown };
    return typeof body.version === "string" ? body.version : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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

export async function refreshIfStale(
  now: number = Date.now(),
  options: { readonly force?: boolean } = {},
): Promise<void> {
  if (isDisabled()) return;
  if (!options.force) {
    const cache = await readCache();
    if (cache !== null && now - cache.lastCheck < TTL_MS) return;
  }
  const latest = await fetchLatest();
  if (latest === null) return;
  try {
    await writeCache({ latest, lastCheck: now });
  } catch {
    // Non-fatal: next run retries.
  }
}

export function getNoticeSync(current: string): UpdateNotice | null {
  if (isDisabled()) return null;
  const cache = readCacheSync();
  if (cache === null) return null;
  if (compareVersions(current, cache.latest) >= 0) return null;
  return { current, latest: cache.latest };
}

export function useColor(): boolean {
  if (process.env["NO_COLOR"] && process.env["NO_COLOR"].length > 0) {
    return false;
  }
  return process.stderr.isTTY === true;
}

function paint(s: string, code: string, color: boolean): string {
  if (!color) return s;
  return `\x1b[${code}m${s}\x1b[0m`;
}

export function formatNotice(
  n: UpdateNotice,
  color: boolean = useColor(),
): string {
  const dim = (s: string): string => paint(s, "2", color);
  const yellow = (s: string): string => paint(s, "33", color);
  const cyan = (s: string): string => paint(s, "36", color);
  const bar = dim("│");
  const lines = [
    "",
    bar,
    `${yellow("▲")}  Update available: ${dim(n.current)} → ${cyan(n.latest)}`,
    `${bar}  Run ${cyan(`npm i -g ${PKG_NAME}`)} to upgrade`,
    dim("└"),
    "",
  ];
  return lines.join("\n");
}

// Dual-hook: `exit` covers process.exit() from exitWithCode (skips beforeExit),
// `beforeExit` covers natural drain. `printed` guards against double-fire.
export function installExitNotice(current: string): void {
  if (isDisabled()) return;
  let printed = false;
  const emit = (): void => {
    if (printed) return;
    printed = true;
    const n = getNoticeSync(current);
    if (n === null) return;
    process.stderr.write(formatNotice(n));
  };
  process.on("beforeExit", emit);
  process.on("exit", emit);
}
