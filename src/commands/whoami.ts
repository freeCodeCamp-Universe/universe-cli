import { log } from "@clack/prompts";
import { resolveIdentity as defaultResolveIdentity } from "../lib/identity.js";
import {
  createProxyClient as defaultCreateProxyClient,
  ProxyError,
  type ProxyClient,
  type ProxyClientConfig,
} from "../lib/proxy-client.js";
import { buildEnvelope, buildErrorEnvelope } from "../output/envelope.js";
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
  exit?: (code: number, message?: string) => never;
}

const DEFAULT_PROXY_URL = "https://uploads.freecode.camp";

function emitJson(envelope: object): void {
  process.stdout.write(JSON.stringify(envelope) + "\n");
}

export async function whoami(
  options: WhoAmIOptions,
  deps: WhoAmIDeps = {},
): Promise<void> {
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
    if (options.json) {
      emitJson(buildErrorEnvelope("whoami", EXIT_CREDENTIALS, msg));
    } else {
      error(msg);
    }
    exit(EXIT_CREDENTIALS, msg);
    return;
  }

  const baseUrl = env["UNIVERSE_PROXY_URL"] ?? DEFAULT_PROXY_URL;
  const client = mkClient({
    baseUrl,
    getAuthToken: () => identity.token,
  });

  try {
    const result = await client.whoami();
    if (options.json) {
      emitJson(
        buildEnvelope("whoami", true, {
          login: result.login,
          authorizedSites: result.authorizedSites,
          identitySource: identity.source,
        }),
      );
    } else {
      const sites =
        result.authorizedSites.length > 0
          ? result.authorizedSites.join(", ")
          : "(no sites authorized)";
      success(
        [
          `Logged in as: ${result.login}`,
          `Authorized sites: ${sites}`,
          `Identity source: ${identity.source}`,
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
    if (options.json) {
      emitJson(buildErrorEnvelope("whoami", exitCode, message));
    } else {
      error(message);
    }
    exit(exitCode, message);
  }
}
