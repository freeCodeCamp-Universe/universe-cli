import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { log } from "@clack/prompts";
import { ConfigError, CredentialError } from "../errors.js";
import { DEFAULT_PROXY_URL } from "../lib/constants.js";
import { resolveIdentity as defaultResolveIdentity } from "../lib/identity.js";
import {
  parsePlatformYaml,
  type PlatformYamlV2,
} from "../lib/platform-yaml.js";
import {
  createProxyClient as defaultCreateProxyClient,
  wrapProxyError,
  type ProxyClient,
  type ProxyClientConfig,
} from "../lib/proxy-client.js";
import { buildEnvelope, buildErrorEnvelope } from "../output/envelope.js";
import { exitWithCode } from "../output/exit-codes.js";

export interface LsOptions {
  json: boolean;
  /** Override site from platform.yaml. */
  site?: string;
}

export interface LsDeps {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  readPlatformYaml?: (cwd: string) => Promise<string>;
  resolveIdentity?: typeof defaultResolveIdentity;
  createProxyClient?: (cfg: ProxyClientConfig) => ProxyClient;
  logSuccess?: (msg: string) => void;
  logInfo?: (msg: string) => void;
  logError?: (msg: string) => void;
  exit?: (code: number, message?: string) => never;
}

const defaultReadPlatformYaml = async (cwd: string): Promise<string> => {
  return readFile(resolve(cwd, "platform.yaml"), "utf-8");
};

function emitJson(envelope: object): void {
  process.stdout.write(JSON.stringify(envelope) + "\n");
}

interface ParsedDeploy {
  deployId: string;
  timestamp: string | null;
  sha: string | null;
}

/**
 * Deploy id format from artemis is `YYYYMMDD-HHMMSS-<sha>` per
 * `internal/r2/r2.go` `NewDeployID`. Pull the timestamp + sha out for
 * presentation; surface a null pair if the id doesn't match (forward-
 * compat with future deploy id schemes).
 */
const DEPLOY_ID_RE = /^(\d{8})-(\d{6})-([a-f0-9]+)$/i;

function parseDeployId(deployId: string): ParsedDeploy {
  const m = DEPLOY_ID_RE.exec(deployId);
  if (!m) return { deployId, timestamp: null, sha: null };
  const [, ymd, hms, sha] = m;
  if (!ymd || !hms || !sha) return { deployId, timestamp: null, sha: null };
  const iso = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T${hms.slice(0, 2)}:${hms.slice(2, 4)}:${hms.slice(4, 6)}Z`;
  return { deployId, timestamp: iso, sha };
}

async function readSiteFromYaml(
  cwd: string,
  read: (cwd: string) => Promise<string>,
): Promise<string | null> {
  let raw: string;
  try {
    raw = await read(cwd);
  } catch (err) {
    if (
      err instanceof Error &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return null;
    }
    throw err;
  }
  const r = parsePlatformYaml(raw);
  if (!r.ok) throw new ConfigError(r.error);
  const config: PlatformYamlV2 = r.value;
  return config.site;
}

function formatTable(deploys: ParsedDeploy[]): string {
  const header = ["DEPLOY ID", "TIMESTAMP", "SHA"];
  const rows = deploys.map((d) => [
    d.deployId,
    d.timestamp ? d.timestamp.replace("T", " ").replace("Z", "") : "—",
    d.sha ?? "—",
  ]);
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)),
  );
  const fmt = (cells: string[]): string =>
    cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join("  ");
  return [fmt(header), ...rows.map(fmt)].join("\n");
}

export async function ls(options: LsOptions, deps: LsDeps = {}): Promise<void> {
  const cwd = deps.cwd ?? process.cwd();
  const env = deps.env ?? process.env;
  const readYaml = deps.readPlatformYaml ?? defaultReadPlatformYaml;
  const resolveId = deps.resolveIdentity ?? defaultResolveIdentity;
  const mkClient = deps.createProxyClient ?? defaultCreateProxyClient;
  const success = deps.logSuccess ?? ((s: string) => log.success(s));
  const info = deps.logInfo ?? ((s: string) => log.info(s));
  const error = deps.logError ?? ((s: string) => log.error(s));
  const exit = deps.exit ?? exitWithCode;

  try {
    const identity = await resolveId({ env });
    if (!identity) {
      throw new CredentialError(
        "No GitHub identity available. Run `universe login`, set $GITHUB_TOKEN, or install the gh CLI.",
      );
    }

    let site = options.site?.trim() || null;
    if (!site) {
      site = await readSiteFromYaml(cwd, readYaml);
    }
    if (!site) {
      throw new ConfigError(
        "No site to list. Run from a directory with `platform.yaml`, or pass `--site <name>`.",
      );
    }

    const baseUrl = env["UNIVERSE_PROXY_URL"] ?? DEFAULT_PROXY_URL;
    const client = mkClient({
      baseUrl,
      getAuthToken: () => identity.token,
    });

    const raw = await client.siteDeploys({ site });
    const deploys = raw.map((d) => parseDeployId(d.deployId));

    if (options.json) {
      emitJson(
        buildEnvelope("ls", true, {
          site,
          deploys,
          identitySource: identity.source,
        }),
      );
      return;
    }

    if (deploys.length === 0) {
      info(`(no deploys for ${site})`);
      return;
    }
    success(formatTable(deploys));
  } catch (err) {
    const { code, message } = wrapProxyError("ls", err);
    if (options.json) {
      emitJson(buildErrorEnvelope("ls", code, message));
    } else {
      error(message);
    }
    exit(code, message);
  }
}
