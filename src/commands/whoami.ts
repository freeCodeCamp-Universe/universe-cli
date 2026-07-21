import { log } from "@clack/prompts";
import { resolveIdentity as defaultResolveIdentity } from "../lib/identity.js";
import {
  createProxyClient as defaultCreateProxyClient,
  parseFetchTimeoutMs,
  ProxyError,
  type ProxyClient,
  type ProxyClientConfig,
} from "../lib/proxy-client.js";
import { buildEnvelope } from "../output/envelope.js";
import { emitJson, outputError } from "../output/format.js";
import { EXIT_CREDENTIALS, exitWithCode } from "../output/exit-codes.js";
import { CliError } from "../errors.js";

export interface WhoAmIOptions {
  json: boolean;
}

export interface WhoAmIDeps {
  resolveIdentity?: typeof defaultResolveIdentity;
  createProxyClient?: (cfg: ProxyClientConfig) => ProxyClient;
  env?: NodeJS.ProcessEnv;
  logSuccess?: (msg: string) => void;
  logError?: (msg: string) => void;
  exit?: (code: number) => never;
}

const DEFAULT_PROXY_URL = "https://uploads.freecode.camp";

export async function whoami(options: WhoAmIOptions, deps: WhoAmIDeps = {}): Promise<void> {
  const env = deps.env ?? process.env;
  const resolve = deps.resolveIdentity ?? defaultResolveIdentity;
  const mkClient = deps.createProxyClient ?? defaultCreateProxyClient;
  const success = deps.logSuccess ?? ((s: string) => log.success(s));
  const error = deps.logError ?? ((s: string) => log.error(s));
  const exit = deps.exit ?? exitWithCode;

  const identity = await resolve({ env });
  if (!identity) {
    const msg =
      "No GitHub identity available. Run `universe login`, set $GITHUB_TOKEN, or install the gh CLI.";
    outputError({ json: options.json, command: "whoami" }, EXIT_CREDENTIALS, msg, {
      logError: error,
    });
    exit(EXIT_CREDENTIALS);
    return;
  }

  const baseUrl = env["UNIVERSE_PROXY_URL"] ?? DEFAULT_PROXY_URL;
  const client = mkClient({
    baseUrl,
    getAuthToken: () => identity.token,
    timeoutMs: parseFetchTimeoutMs(env),
  });

  try {
    const result = await client.whoami();
    const count = result.authorizedSites.length;
    if (options.json) {
      emitJson(
        buildEnvelope("whoami", true, {
          login: result.login,
          identitySource: identity.source,
          proxyUrl: baseUrl,
          authorizedSitesCount: count,
        }),
      );
    } else {
      const sitesLine =
        count === 0
          ? "Authorized for 0 sites."
          : `Authorized for ${count} site${count === 1 ? "" : "s"} — run \`universe sites ls --mine\``;
      success(
        [
          `Logged in as: ${result.login}`,
          `Identity source: ${identity.source}`,
          `Proxy: ${baseUrl}`,
          sitesLine,
        ].join("\n"),
      );
    }
  } catch (err) {
    const exitCode = err instanceof CliError ? err.exitCode : EXIT_CREDENTIALS;
    const message =
      err instanceof ProxyError
        ? `whoami failed (${err.code}): ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
    outputError({ json: options.json, command: "whoami" }, exitCode, message, {
      logError: error,
    });
    exit(exitCode);
  }
}
