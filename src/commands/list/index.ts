import { readFile as nodeReadFile } from "node:fs/promises";
import { join } from "node:path";
import type { IdentityResolver } from "../../auth/identity-resolver.port.js";
import { ConfigError, CredentialError } from "../../errors/cli-errors.js";
import type { Logger } from "../../output/logger.js";
import { writeJson } from "../../output/write-json.js";
import { parsePlatformYaml } from "../../platform/platform-yaml-v2.js";
import type { DeploySummary, ProxyClient } from "../../platform/proxy-client.port.js";
import type { HandlerResult } from "../create/index.js";

interface ListOptions {
  cwd: string;
  json: boolean;
  site?: string;
}

interface ListDeps {
  identityResolver: IdentityResolver;
  logger: Logger;
  proxyClient: ProxyClient;
  readFile?: (path: string) => Promise<string>;
}

interface ParsedDeploy {
  deployId: string;
  sha: string | null;
  timestamp: string | null;
}

const DEPLOY_ID_RE = /^(\d{8})-(\d{6})-([a-f0-9]+)$/i;

const parseDeployId = (deployId: string): ParsedDeploy => {
  const m = DEPLOY_ID_RE.exec(deployId);
  if (!m) {
    return { deployId, sha: null, timestamp: null };
  }
  const [, ymd, hms, sha] = m;
  if (ymd === undefined || hms === undefined || sha === undefined) {
    return { deployId, sha: null, timestamp: null };
  }
  const iso = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T${hms.slice(0, 2)}:${hms.slice(2, 4)}:${hms.slice(4, 6)}Z`;
  return { deployId, sha, timestamp: iso };
};

const formatTable = (deploys: ParsedDeploy[]): string => {
  const header = ["DEPLOY ID", "TIMESTAMP", "SHA"];
  const rows = deploys.map((d) => [
    d.deployId,
    d.timestamp === null ? "—" : d.timestamp.replace("T", " ").replace("Z", ""),
    d.sha ?? "—",
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const fmt = (cells: string[]): string => cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join("  ");
  return [fmt(header), ...rows.map(fmt)].join("\n");
};

const defaultReadFileFn = (path: string): Promise<string> => nodeReadFile(path, "utf-8");

const handleList = async (opts: ListOptions, deps: ListDeps): Promise<HandlerResult> => {
  const { logger } = deps;
  const read = deps.readFile ?? defaultReadFileFn;

  // 1. Resolve identity
  const identity = await deps.identityResolver.resolve();
  if (identity === null) {
    throw new CredentialError(
      "No GitHub identity available. Run `universe login`, set $GITHUB_TOKEN, or install the gh CLI.",
    );
  }

  // 2. Resolve site name — from --site flag or platform.yaml
  let site: string;
  if (opts.site === undefined) {
    let rawYaml: string;
    try {
      rawYaml = await read(join(opts.cwd, "platform.yaml"));
    } catch {
      throw new ConfigError(
        "No site to list. Run from a directory with `platform.yaml`, or pass `--site <name>`.",
      );
    }

    const parseResult = parsePlatformYaml(rawYaml);
    if (!parseResult.ok) {
      throw new ConfigError(parseResult.error);
    }
    site = parseResult.value.site.trim();
  } else {
    site = opts.site.trim();
  }

  // 3. Fetch and parse deploys
  const raw: DeploySummary[] = await deps.proxyClient.siteDeploys({ site });
  const deploys = raw.map((d) => parseDeployId(d.deployId));

  // 4. Emit output
  if (opts.json) {
    writeJson("static list", true, { deploys, site });
  } else if (deploys.length === 0) {
    logger.info(`(no deploys for ${site})`);
  } else {
    logger.success(formatTable(deploys));
  }

  return { exitCode: 0 };
};

export { handleList, type ListDeps, type ListOptions };
