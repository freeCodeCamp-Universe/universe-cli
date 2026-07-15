import { CredentialError, UsageError } from "../../errors.js";
import { DEFAULT_PROXY_URL } from "../../lib/constants.js";
import { resolveIdentity as defaultResolveIdentity } from "../../lib/identity.js";
import {
  createProxyClient as defaultCreateProxyClient,
  parseFetchTimeoutMs,
  type ProxyClient,
  type ProxyClientConfig,
} from "../../lib/proxy-client.js";

export interface AuditCommandDeps {
  env?: NodeJS.ProcessEnv;
  resolveIdentity?: typeof defaultResolveIdentity;
  createProxyClient?: (cfg: ProxyClientConfig) => ProxyClient;
  logMessage?: (msg: string) => void;
  logError?: (msg: string) => void;
  exit?: (code: number) => never;
}

export async function setupClient(deps: AuditCommandDeps): Promise<{
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
  });
  return { client, identitySource: identity.source };
}

export { UsageError };
