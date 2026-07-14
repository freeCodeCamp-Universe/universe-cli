import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { cacheBase } from "../commands/create/layer-composition/template-cache.js";
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

const APP_DIR = "universe-cli";
const TEMPLATES_DIR = "templates";
const CACHE_FILE = "template-version-check.json";
const GITHUB_LATEST_URL =
  "https://api.github.com/repos/freeCodeCamp-Universe/templates/releases/latest";
const FETCH_TIMEOUT_MS = 3_000;
const TAG_PREFIX = "app-templates-v";

function templateCheckCachePath(): string {
  return join(cacheBase(), APP_DIR, TEMPLATES_DIR, CACHE_FILE);
}

async function readTemplateCache(): Promise<CacheShape | null> {
  try {
    const raw = await readFile(templateCheckCachePath(), "utf-8");
    return parseCache(raw);
  } catch {
    return null;
  }
}

async function writeTemplateCache(c: CacheShape): Promise<void> {
  const path = templateCheckCachePath();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify(c), { mode: 0o644 });
}

export async function fetchLatestTemplateVersion(): Promise<string | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(GITHUB_LATEST_URL, {
      signal: ctl.signal,
      headers: { accept: "application/vnd.github+json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { tag_name?: unknown };
    if (typeof body.tag_name !== "string") return null;
    if (!body.tag_name.startsWith(TAG_PREFIX)) return null;
    return body.tag_name.slice(TAG_PREFIX.length);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkTemplateVersion(
  currentVersion: string,
  now: number = Date.now(),
): Promise<UpdateNotice | null> {
  if (isDisabled()) return null;

  const cache = await readTemplateCache();
  if (cache !== null && now - cache.lastCheck < ttlMs()) {
    if (compareVersions(currentVersion, cache.latest) < 0) {
      return { current: currentVersion, latest: cache.latest };
    }
    return null;
  }

  const latest = await fetchLatestTemplateVersion();
  if (latest === null) return null;

  try {
    await writeTemplateCache({ latest, lastCheck: now });
  } catch {
    // Non-fatal: next run retries.
  }

  if (compareVersions(currentVersion, latest) < 0) {
    return { current: currentVersion, latest };
  }
  return null;
}

export function formatTemplateNotice(
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
    `${yellow("▲")}  Newer templates available: ${dim(n.current)} → ${cyan(n.latest)}`,
    `${bar}  Set ${cyan(`UNIVERSE_TEMPLATES_VERSION=${n.latest}`)} to use them.`,
    dim("└"),
    "",
  ];
  return lines.join("\n");
}
