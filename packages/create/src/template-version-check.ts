import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import pkg from "../package.json" with { type: "json" };

import { templatesCache } from "./layer-composition/template-cache.js";
import { ConfigError } from "@freecodecamp/universe-core";
import {
  type TemplateCacheShape,
  type UpdateNotice,
  compareVersions,
  paint,
  parseTemplateCache,
  ttlMs,
  useColor,
  maxSatisfying,
} from "@freecodecamp/universe-core";

const cliVersion = pkg.version;
const CACHE_FILE = "template-version-check.json";
const GITHUB_RELEASES_URL =
  "https://api.github.com/repos/freeCodeCamp-Universe/templates/releases?per_page=100";
const FETCH_TIMEOUT_MS = 3_000;
const TAG_PREFIX = "app-templates-v";

function templateCheckCachePath(): string {
  return join(templatesCache(), CACHE_FILE);
}

interface GitHubRelease {
  tag_name?: unknown;
  draft?: unknown;
  prerelease?: unknown;
}

interface Tagged {
  tag_name: string;
}

function validRelease(r: GitHubRelease): r is Tagged {
  if (r.draft === true || r.prerelease === true) return false;
  if (typeof r.tag_name !== "string") return false;

  return r.tag_name.startsWith(TAG_PREFIX);
}

function extractVersions(releases: GitHubRelease[]): string[] {
  return releases.filter(validRelease).map((r) => r.tag_name.slice(TAG_PREFIX.length));
}

export interface TemplateVersions {
  latest: string;
  latestCompatible: string;
}

async function readTemplateCacheFile(): Promise<TemplateCacheShape | null> {
  try {
    const raw = await readFile(templateCheckCachePath(), "utf-8");
    return parseTemplateCache(raw);
  } catch {
    return null;
  }
}

async function writeTemplateCacheFile(c: TemplateCacheShape): Promise<void> {
  const path = templateCheckCachePath();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify(c), { mode: 0o644 });
}

export async function resolveTemplateVersions(
  range: string,
  now: number = Date.now(),
): Promise<TemplateVersions> {
  const cache = await readTemplateCacheFile();
  if (cache !== null && now - cache.lastCheck < ttlMs() && cache.cliVersion === cliVersion) {
    return { latest: cache.latest, latestCompatible: cache.latestCompatible };
  }

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  let versions: string[];
  try {
    const res = await fetch(GITHUB_RELEASES_URL, {
      signal: ctl.signal,
      headers: { accept: "application/vnd.github+json" },
    });
    if (!res.ok) {
      throw new ConfigError(`Failed to fetch template releases: HTTP ${String(res.status)}`);
    }
    const releases = (await res.json()) as GitHubRelease[];
    versions = extractVersions(releases);
  } catch (err) {
    if (err instanceof ConfigError) throw err;
    throw new ConfigError("Failed to fetch template releases. Check network connectivity.");
  } finally {
    clearTimeout(timer);
  }

  if (versions.length === 0) {
    throw new ConfigError("No template releases found.");
  }

  const latestCompatible = maxSatisfying(versions, range);
  if (latestCompatible === null) {
    throw new ConfigError(`No template releases match range "${range}".`);
  }

  const latest = versions.reduce((a, b) => (compareVersions(a, b) < 0 ? b : a));

  try {
    await writeTemplateCacheFile({ latest, latestCompatible, lastCheck: now, cliVersion });
  } catch {
    // Non-fatal: next run retries.
  }

  return { latest, latestCompatible };
}

export function formatTemplateNotice(n: UpdateNotice, color: boolean = useColor()): string {
  const dim = (s: string): string => paint(s, "2", color);
  const yellow = (s: string): string => paint(s, "33", color);
  const cyan = (s: string): string => paint(s, "36", color);
  const bar = dim("│");
  const lines = [
    "",
    bar,
    `${yellow("▲")}  Newer templates available: ${dim(n.current)} → ${cyan(n.latest)}`,
    dim("└"),
    "",
  ];
  return lines.join("\n");
}
