import { CredentialError, UsageError } from "../../errors.js";
import { DEFAULT_PROXY_URL } from "../../lib/constants.js";
import { resolveIdentity as defaultResolveIdentity } from "../../lib/identity.js";
import {
  createProxyClient as defaultCreateProxyClient,
  parseFetchTimeoutMs,
  type ProxyClient,
  type ProxyClientConfig,
  type RepoRow,
} from "../../lib/proxy-client.js";

interface RepoSdkDeps {
  env?: NodeJS.ProcessEnv;
  resolveIdentity?: typeof defaultResolveIdentity;
  createProxyClient?: (cfg: ProxyClientConfig) => ProxyClient;
}

interface RepoCommandDeps extends RepoSdkDeps {
  logSuccess?: (msg: string) => void;
  logError?: (msg: string) => void;
  logMessage?: (msg: string) => void;
  exit?: (code: number) => void;
  isTTY?: boolean;
}

async function setupClient(deps: RepoSdkDeps): Promise<{
  client: ProxyClient;
  identitySource: string;
}> {
  const env = deps.env ?? process.env;
  const resolveId = deps.resolveIdentity ?? defaultResolveIdentity;
  const mkClient = deps.createProxyClient ?? defaultCreateProxyClient;

  const identity = await resolveId({ env });
  if (!identity) {
    throw new CredentialError(
      "No GitHub identity available. Run `universe login`, set $GITHUB_TOKEN, or install the gh CLI.",
    );
  }

  const baseUrl = env["UNIVERSE_PROXY_URL"] ?? DEFAULT_PROXY_URL;
  const client = mkClient({
    baseUrl,
    getAuthToken: () => identity.token,
    timeoutMs: parseFetchTimeoutMs(env),
    debug: Boolean(env["UNIVERSE_DEBUG"]),
  });
  return { client, identitySource: identity.source };
}

function humanizeDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d${h % 24}h`;
}

const RESOLVED_STATUSES = new Set(["active", "rejected", "failed"]);

function resolveLatency(r: RepoRow): string {
  if (!RESOLVED_STATUSES.has(r.status)) return "";
  const ms = Date.parse(r.updatedAt) - Date.parse(r.createdAt);
  if (!Number.isFinite(ms) || ms < 0) return "";
  return humanizeDuration(ms);
}

function formatRepoTable(rows: RepoRow[], emptyMsg = "No repo requests."): string {
  if (rows.length === 0) return emptyMsg;
  const headers = [
    "ID",
    "REPO",
    "VIS",
    "STATUS",
    "REQUESTED BY",
    "REQUESTED AT",
    "APPROVER",
    "LATENCY",
  ];
  const cells: string[][] = rows.map((r) => [
    r.id,
    r.name,
    r.visibility,
    r.status,
    r.requestedBy,
    r.createdAt,
    r.approver ?? "",
    resolveLatency(r),
  ]);
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...cells.map((row) => row[i]?.length ?? 0)),
  );
  const fmt = (row: string[]): string => row.map((c, i) => c.padEnd(widths[i] ?? 0)).join("  ");
  return [fmt(headers), ...cells.map(fmt)].join("\n");
}

export { formatRepoTable, setupClient, UsageError };
export type { RepoCommandDeps, RepoSdkDeps };
