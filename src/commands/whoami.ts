import { log } from "@clack/prompts";
import { CredentialError } from "../errors.js";
import { resolveIdentity as defaultResolveIdentity } from "../lib/identity.js";
import {
  createProxyClient as defaultCreateProxyClient,
  parseFetchTimeoutMs,
  type ProxyClient,
  type ProxyClientConfig,
} from "../lib/proxy-client.js";
import type { CommandResult } from "../output/command-result.js";
import { buildEnvelope } from "../output/envelope.js";
import { emitJson, outputError } from "../output/format.js";
import { exitWithCode } from "../output/exit-codes.js";

interface WhoamiDeps {
  resolveIdentity?: typeof defaultResolveIdentity;
  createProxyClient?: (cfg: ProxyClientConfig) => ProxyClient;
  env?: NodeJS.ProcessEnv;
}

interface WhoamiHandlerDeps extends WhoamiDeps {
  logSuccess?: (msg: string) => void;
  logError?: (msg: string) => void;
  exit?: (code: number) => void;
}

interface WhoamiHandlerOptions {
  json: boolean;
}

const DEFAULT_PROXY_URL = "https://uploads.freecode.camp";

/** Resolve the active GitHub identity and query the proxy for authorized sites. */
async function whoami(deps: WhoamiDeps = {}): Promise<CommandResult> {
  const env = deps.env ?? process.env;
  const resolve = deps.resolveIdentity ?? defaultResolveIdentity;
  const mkClient = deps.createProxyClient ?? defaultCreateProxyClient;

  const identity = await resolve({ env });
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

  const result = await client.whoami();
  const count = result.authorizedSites.length;

  const sitesLine =
    count === 0
      ? "Authorized for 0 sites."
      : `Authorized for ${count} site${count === 1 ? "" : "s"} — run \`universe sites ls --mine\``;

  const format = [
    `Logged in as: ${result.login}`,
    `Identity source: ${identity.source}`,
    `Proxy: ${baseUrl}`,
    sitesLine,
  ].join("\n");

  return {
    data: buildEnvelope("whoami", true, {
      login: result.login,
      identitySource: identity.source,
      proxyUrl: baseUrl,
      authorizedSitesCount: count,
    }),
    format,
  };
}

async function whoamiHandler(
  options: WhoamiHandlerOptions,
  deps: WhoamiHandlerDeps = {},
): Promise<void> {
  const success = deps.logSuccess ?? ((s: string) => log.success(s));
  const error = deps.logError ?? ((s: string) => log.error(s));
  const exit = deps.exit ?? exitWithCode;

  try {
    const result = await whoami(deps);

    if (options.json) {
      emitJson(result.data);
    } else {
      success(result.format);
    }
  } catch (err) {
    exit(outputError({ json: options.json, command: "whoami" }, err, { logError: error }));
  }
}

export { whoami, whoamiHandler };
export type { WhoamiDeps, WhoamiHandlerDeps, WhoamiHandlerOptions };
