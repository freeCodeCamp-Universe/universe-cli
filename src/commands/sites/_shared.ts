import { CredentialError, UsageError } from "../../errors.js";
import { DEFAULT_PROXY_URL } from "../../lib/constants.js";
import { resolveIdentity as defaultResolveIdentity } from "../../lib/identity.js";
import {
  createProxyClient as defaultCreateProxyClient,
  type ProxyClient,
  type ProxyClientConfig,
} from "../../lib/proxy-client.js";

export interface SitesCommandDeps {
  env?: NodeJS.ProcessEnv;
  resolveIdentity?: typeof defaultResolveIdentity;
  createProxyClient?: (cfg: ProxyClientConfig) => ProxyClient;
  logSuccess?: (msg: string) => void;
  logError?: (msg: string) => void;
  exit?: (code: number) => never;
}

export function emitJson(envelope: object): void {
  process.stdout.write(JSON.stringify(envelope) + "\n");
}

/**
 * Parse the `--team` / `--teams` flag into a clean string array.
 * Accepts a single value (`--team=staff`) or comma-separated
 * (`--team=staff,news-editors`). Whitespace is trimmed; empty
 * fragments are dropped. Returns `[]` for nullish input.
 */
export function parseTeamsFlag(raw: string | string[] | undefined): string[] {
  if (raw === undefined || raw === null) return [];
  const tokens = Array.isArray(raw) ? raw : [raw];
  return tokens
    .flatMap((s) => s.split(","))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Resolve identity + construct a proxy client. Throws CredentialError
 * if no identity is available — caller wraps via wrapProxyError.
 */
export async function setupClient(deps: SitesCommandDeps): Promise<{
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
  });
  return { client, identitySource: identity.source };
}

export { UsageError };
