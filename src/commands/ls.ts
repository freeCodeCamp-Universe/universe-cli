import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { log } from "@clack/prompts";
import { ConfigError, CredentialError } from "../errors.js";
import { DEFAULT_PROXY_URL } from "../lib/constants.js";
import { resolveIdentity as defaultResolveIdentity } from "../lib/identity.js";
import { parsePlatformYaml, type PlatformYamlV2 } from "../lib/platform-yaml.js";
import {
  createProxyClient as defaultCreateProxyClient,
  parseFetchTimeoutMs,
  wrapProxyError,
  type ProxyClient,
  type ProxyClientConfig,
} from "../lib/proxy-client.js";
import { buildEnvelope } from "../output/envelope.js";
import { exitWithCode } from "../output/exit-codes.js";
import { emitJson, outputError } from "../output/format.js";

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
  exit?: (code: number) => never;
}

const defaultReadPlatformYaml = async (cwd: string): Promise<string> => {
  return readFile(resolve(cwd, "platform.yaml"), "utf-8");
};

type DeployState = "preview" | "production" | "preview+production" | null;

interface ParsedDeploy {
  deployId: string;
  timestamp: string | null;
  sha: string | null;
}

interface DeployRow extends ParsedDeploy {
  state: DeployState;
  actor?: string;
}

function deployState(
  deployId: string,
  previewId: string | null,
  productionId: string | null,
): DeployState {
  const isPreview = deployId === previewId;
  const isProduction = deployId === productionId;
  if (isPreview && isProduction) return "preview+production";
  if (isProduction) return "production";
  if (isPreview) return "preview";
  return null;
}

/**
 * Deploy id format from artemis is `YYYYMMDD-HHMMSS-<suffix>` per
 * `internal/r2/r2.go` `NewDeployID`. Pull the timestamp + suffix out
 * for presentation; surface a null pair if the id doesn't match
 * (forward-compat with future deploy id schemes).
 *
 * Suffix is `\S+` to match server validation in
 * `internal/handler/site.go` `deployIDPattern` — accepts hex SHAs,
 * `nogit-N` fallbacks (when the build dir isn't a git checkout), and
 * any future suffix shape. Narrower client regex (V8) silently drops
 * valid ids on `static ls`.
 */
const DEPLOY_ID_RE = /^(\d{8})-(\d{6})-(\S+)$/;

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
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }
  const r = parsePlatformYaml(raw);
  if (!r.ok) throw new ConfigError(r.error);
  const config: PlatformYamlV2 = r.value;
  return config.site;
}

function formatTable(deploys: DeployRow[]): string {
  const header = ["DEPLOY ID", "TIMESTAMP", "SHA", "STATE", "ACTOR"];
  const rows = deploys.map((d) => [
    d.deployId,
    d.timestamp ? d.timestamp.replace("T", " ").replace("Z", "") : "—",
    d.sha ?? "—",
    d.state ?? "—",
    d.actor ?? "—",
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const fmt = (cells: string[]): string => cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join("  ");
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
      timeoutMs: parseFetchTimeoutMs(env),
    });

    const raw = await client.siteDeploys({ site });
    // Defensive: artemis returns ascending (oldest-first) lex order, which
    // makes the operator-visible top-of-list the OLDEST deploy. Reverse so
    // the newest deploy is at index 0 — the natural operator expectation
    // and the assumption shared by every downstream consumer.
    const sorted = [...raw].sort((a, b) => b.deployId.localeCompare(a.deployId));
    const parsed = sorted.map((d) => parseDeployId(d.deployId));

    let previewId: string | null = null;
    let productionId: string | null = null;
    if (parsed.length > 0) {
      const [preview, production] = await Promise.all([
        client.getAlias({ site, mode: "preview" }),
        client.getAlias({ site, mode: "production" }),
      ]);
      previewId = preview?.deployId ?? null;
      productionId = production?.deployId ?? null;
    }

    const deploys: DeployRow[] = parsed.map((d, i) => ({
      ...d,
      state: deployState(d.deployId, previewId, productionId),
      actor: sorted[i]?.actor,
    }));

    if (options.json) {
      emitJson(
        buildEnvelope("ls", true, {
          site,
          deploys,
          aliases: { preview: previewId, production: productionId },
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
    outputError({ json: options.json, command: "ls" }, code, message, {
      logError: error,
    });
    exit(code);
  }
}
