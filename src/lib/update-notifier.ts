import { spawn } from "node:child_process";
import { readFileSync, writeSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import {
  type CacheShape,
  type UpdateNotice,
  compareVersions,
  isDisabled,
  paint,
  parseCache,
  ttlMs,
  useColor,
} from "./version-utils.js";

// Opt-out: UNIVERSE_NO_UPDATE_CHECK=1.
// Cache: $XDG_CONFIG_HOME/universe-cli/update-check.json (fallback $HOME/.config/...).

const APP_DIR = "universe-cli";
const CACHE_FILE = "update-check.json";
const PKG_NAME = "@freecodecamp/universe-cli";
const NPM_LATEST_URL = `https://registry.npmjs.org/${PKG_NAME}/latest`;
const FETCH_TIMEOUT_MS = 3_000;

export const REFRESH_ENV = "UNIVERSE_REFRESH_WORKER";

function latestUrl(): string {
  const override = process.env["UNIVERSE_UPDATE_URL"];
  return override && override.length > 0 ? override : NPM_LATEST_URL;
}

function configBase(): string {
  const xdg = process.env["XDG_CONFIG_HOME"];
  if (xdg && xdg.length > 0) return xdg;
  return join(homedir(), ".config");
}

export function cachePath(): string {
  return join(configBase(), APP_DIR, CACHE_FILE);
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
    const res = await fetch(latestUrl(), {
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

export async function refreshIfStale(
  now: number = Date.now(),
  options: { readonly force?: boolean } = {},
): Promise<void> {
  if (isDisabled()) return;
  if (!options.force) {
    const cache = await readCache();
    if (cache !== null && now - cache.lastCheck < ttlMs()) return;
  }
  const latest = await fetchLatest();
  if (latest === null) return;
  try {
    await writeCache({ latest, lastCheck: now });
  } catch {
    // Non-fatal: next run retries.
  }
}

export function spawnRefresh(now: number = Date.now()): void {
  if (isDisabled()) return;
  const cache = readCacheSync();
  if (cache !== null && now - cache.lastCheck < ttlMs()) return;
  try {
    const entry = process.argv[1];
    const args = entry ? [entry] : [];
    const child = spawn(process.execPath, args, {
      detached: true,
      stdio: "ignore",
      env: { ...process.env, [REFRESH_ENV]: "1" },
    });
    child.unref();
  } catch {
    void 0;
  }
}

export async function runRefreshWorker(): Promise<void> {
  await refreshIfStale(Date.now(), { force: true });
}

export function getNoticeSync(current: string): UpdateNotice | null {
  if (isDisabled()) return null;
  const cache = readCacheSync();
  if (cache === null) return null;
  if (compareVersions(current, cache.latest) >= 0) return null;
  return { current, latest: cache.latest };
}

export function formatNotice(n: UpdateNotice, color: boolean = useColor()): string {
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

export function installExitNotice(current: string): void {
  if (isDisabled()) return;
  let printed = false;
  const emit = (): void => {
    if (printed) return;
    printed = true;
    const n = getNoticeSync(current);
    if (n === null) return;
    // writeSync: stderr.write async on POSIX pipes, dropped in `exit`. https://nodejs.org/api/process.html#a-note-on-process-io
    try {
      writeSync(2, formatNotice(n));
    } catch {
      void 0;
    }
  };
  process.on("beforeExit", emit);
  process.on("exit", emit);
}

export { compareVersions, isDisabled, type UpdateNotice };
