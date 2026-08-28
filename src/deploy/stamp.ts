import { randomInt } from "node:crypto";
import type { GitState } from "./git.js";

export type ShaSource = "head" | "dirty" | "dirover" | "synthetic";

export type SentinelSource = Exclude<ShaSource, "head">;

export interface ShaStamp {
  sha: string;
  source: ShaSource;
}

const SENTINEL_PREFIX: Record<SentinelSource, string> = {
  dirty: "dty",
  dirover: "dov",
  synthetic: "nog",
};

const BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";
const SUFFIX_LENGTH = 4;

function sentinel(source: SentinelSource): ShaStamp {
  let suffix = "";
  for (let i = 0; i < SUFFIX_LENGTH; i += 1) {
    suffix += BASE36[randomInt(0, BASE36.length)];
  }
  return { sha: `${SENTINEL_PREFIX[source]}${suffix}`, source };
}

const SOURCE_BY_PREFIX = new Map<string, SentinelSource>(
  Object.entries(SENTINEL_PREFIX).map(([source, prefix]) => [prefix, source as SentinelSource]),
);

export function sentinelSourceOf(sha: string): SentinelSource | null {
  return SOURCE_BY_PREFIX.get(sha.slice(0, 3)) ?? null;
}

export function deployIdSha(deployId: string): string | null {
  const m = /^\d{8}-\d{6}-(\S+)$/.exec(deployId);
  return m?.[1] ?? null;
}

export function deployIdSentinelSource(deployId: string): SentinelSource | null {
  const sha = deployIdSha(deployId);
  return sha === null ? null : sentinelSourceOf(sha);
}

export function stampSha(git: GitState, dirOverride: boolean): ShaStamp {
  if (git.hash === null) return sentinel("synthetic");
  if (git.dirty) return sentinel("dirty");
  if (dirOverride) return sentinel("dirover");
  return { sha: git.hash, source: "head" };
}
