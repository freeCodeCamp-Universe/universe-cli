import {
  confirm as clackConfirm,
  isCancel as clackIsCancel,
  select as clackSelect,
  text as clackText,
} from "@clack/prompts";
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

/**
 * Prompt seam injected into the interactive commands (create / approve /
 * reject) so tests can drive the flow without a TTY. Defaults wrap the
 * real `@clack/prompts` primitives.
 */
export interface RepoPrompts {
  text: typeof clackText;
  select: typeof clackSelect;
  confirm: typeof clackConfirm;
  isCancel: (value: unknown) => boolean;
}

export const defaultRepoPrompts: RepoPrompts = {
  text: clackText,
  select: clackSelect,
  confirm: clackConfirm,
  isCancel: clackIsCancel,
};

export interface RepoCommandDeps {
  env?: NodeJS.ProcessEnv;
  resolveIdentity?: typeof defaultResolveIdentity;
  createProxyClient?: (cfg: ProxyClientConfig) => ProxyClient;
  logSuccess?: (msg: string) => void;
  logError?: (msg: string) => void;
  logMessage?: (msg: string) => void;
  exit?: (code: number) => never;
  /** Prompt seam (interactive create/approve/reject). */
  prompts?: RepoPrompts;
  /** Whether the session is interactive. Defaults to process.stdout.isTTY. */
  isTTY?: boolean;
}

export function emitJson(envelope: object): void {
  process.stdout.write(JSON.stringify(envelope) + "\n");
}

/**
 * Resolve identity + construct a proxy client. Throws CredentialError
 * when no identity is available — the caller wraps via wrapProxyError.
 */
export async function setupClient(deps: RepoCommandDeps): Promise<{
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

/**
 * Render repo-request rows as an aligned text table. Returns `emptyMsg`
 * when there are no rows (the caller passes a status-specific phrase).
 */
export function formatRepoTable(
  rows: RepoRow[],
  emptyMsg = "No repo requests.",
): string {
  if (rows.length === 0) return emptyMsg;
  const headers = [
    "ID",
    "REPO",
    "VIS",
    "STATUS",
    "REQUESTED BY",
    "REQUESTED AT",
  ];
  const cells: string[][] = rows.map((r) => [
    r.id,
    r.name,
    r.visibility,
    r.status,
    r.requestedBy,
    r.createdAt,
  ]);
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...cells.map((row) => row[i]?.length ?? 0)),
  );
  const fmt = (row: string[]): string =>
    row.map((c, i) => c.padEnd(widths[i] ?? 0)).join("  ");
  return [fmt(headers), ...cells.map(fmt)].join("\n");
}

export { UsageError };
