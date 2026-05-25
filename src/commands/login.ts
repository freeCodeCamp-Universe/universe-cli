import { log } from "@clack/prompts";
import { DEFAULT_GH_CLIENT_ID } from "../lib/constants.js";
import { runDeviceFlow as defaultRunDeviceFlow } from "../lib/device-flow.js";
import {
  createProxyClient as defaultCreateProxyClient,
  parseFetchTimeoutMs,
  type ProxyClient,
  type ProxyClientConfig,
} from "../lib/proxy-client.js";
import {
  loadToken as defaultLoadToken,
  saveToken as defaultSaveToken,
} from "../lib/token-store.js";
import { buildEnvelope } from "../output/envelope.js";
import {
  EXIT_CONFIRM,
  EXIT_CREDENTIALS,
  exitWithCode,
} from "../output/exit-codes.js";
import { outputError } from "../output/format.js";

export interface LoginOptions {
  json: boolean;
  force?: boolean;
}

export interface LoginDeps {
  runDeviceFlow?: typeof defaultRunDeviceFlow;
  saveToken?: typeof defaultSaveToken;
  loadToken?: typeof defaultLoadToken;
  createProxyClient?: (cfg: ProxyClientConfig) => ProxyClient;
  env?: NodeJS.ProcessEnv;
  logSuccess?: (msg: string) => void;
  logInfo?: (msg: string) => void;
  logWarn?: (msg: string) => void;
  logError?: (msg: string) => void;
  exit?: (code: number) => never;
}

const DEFAULT_SCOPE = "read:org user:email";
const DEFAULT_PROXY_URL = "https://uploads.freecode.camp";
const NO_SITES_WARNING = [
  "Logged in, but the proxy reports 0 authorized sites for your account.",
  "This usually means the Universe CLI GitHub App is not installed on the org",
  "that owns the registry-authz team (production: `freeCodeCamp-Universe`), or",
  "your account is not on a team granted access to any site.",
  "",
  "Next steps:",
  "  1. Run `universe whoami` to confirm the identity that resolved.",
  "  2. Ask an org owner to install the Universe CLI GitHub App on the org.",
  "  3. Confirm your team membership at",
  "     https://github.com/orgs/freeCodeCamp-Universe/teams.",
].join("\n");

function emitJson(envelope: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(envelope) + "\n");
}

export async function login(
  options: LoginOptions,
  deps: LoginDeps = {},
): Promise<void> {
  const env = deps.env ?? process.env;
  const runFlow = deps.runDeviceFlow ?? defaultRunDeviceFlow;
  const save = deps.saveToken ?? defaultSaveToken;
  const load = deps.loadToken ?? defaultLoadToken;
  const success = deps.logSuccess ?? ((s: string) => log.success(s));
  const info = deps.logInfo ?? ((s: string) => log.info(s));
  const error = deps.logError ?? ((s: string) => log.error(s));
  const exit = deps.exit ?? exitWithCode;

  const envClientId = env["UNIVERSE_GH_CLIENT_ID"];
  const clientId =
    envClientId && envClientId.trim().length > 0
      ? envClientId
      : DEFAULT_GH_CLIENT_ID;

  if (!options.force) {
    const existing = await load();
    if (existing) {
      const msg =
        "Already logged in. Run `universe logout` first or pass --force to replace the stored token.";
      if (options.json) {
        emitJson({
          schemaVersion: "1",
          command: "login",
          success: false,
          timestamp: new Date().toISOString(),
          error: { code: EXIT_CONFIRM, message: msg },
        });
      } else {
        error(msg);
      }
      exit(EXIT_CONFIRM);
      return;
    }
  }

  let token: string;
  try {
    token = await runFlow({
      clientId,
      scope: DEFAULT_SCOPE,
      onPrompt: ({ userCode, verificationUri, expiresIn }) => {
        if (options.json) {
          emitJson(
            buildEnvelope("login", true, {
              userCode,
              verificationUri,
              expiresIn,
              stored: false,
            }),
          );
        } else {
          info(
            [
              `Open ${verificationUri} in your browser`,
              `and enter code: ${userCode}`,
              `(code expires in ${Math.round(expiresIn / 60)} min)`,
            ].join("\n"),
          );
        }
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    outputError(
      { json: options.json, command: "login" },
      EXIT_CREDENTIALS,
      message,
      { logError: error },
    );
    exit(EXIT_CREDENTIALS);
    return;
  }

  await save(token);

  const selfCheck = await postLoginSelfCheck(token, env, deps);

  if (options.json) {
    emitJson(
      buildEnvelope("login", true, {
        stored: true,
        ...(selfCheck.checked
          ? {
              authorizedSitesCount: selfCheck.authorizedSitesCount,
              ...(selfCheck.warning ? { warning: selfCheck.warning } : {}),
            }
          : {}),
      }),
    );
  } else {
    success("Logged in. Token stored at ~/.config/universe-cli/token.");
    if (selfCheck.checked && selfCheck.warning) {
      const warn = deps.logWarn ?? ((s: string) => log.warn(s));
      warn(selfCheck.warning);
    }
  }
}

interface SelfCheckResult {
  /** False if the proxy probe failed (network etc.) — login still succeeds. */
  checked: boolean;
  authorizedSitesCount: number;
  /** Set only when count is 0. Carries the human-readable hint. */
  warning?: string;
}

/**
 * Best-effort post-login probe. Never throws — login itself must
 * succeed regardless of proxy reachability. If the bearer can't see
 * any authorized sites, surface the hint so users don't discover the
 * App-installation gap at `sites register` time.
 */
async function postLoginSelfCheck(
  token: string,
  env: NodeJS.ProcessEnv,
  deps: LoginDeps,
): Promise<SelfCheckResult> {
  const mkClient = deps.createProxyClient ?? defaultCreateProxyClient;
  try {
    const baseUrl = env["UNIVERSE_PROXY_URL"] ?? DEFAULT_PROXY_URL;
    const client = mkClient({
      baseUrl,
      getAuthToken: () => token,
      timeoutMs: parseFetchTimeoutMs(env),
    });
    const result = await client.whoami();
    const count = result.authorizedSites.length;
    if (count === 0) {
      return {
        checked: true,
        authorizedSitesCount: 0,
        warning: NO_SITES_WARNING,
      };
    }
    return { checked: true, authorizedSitesCount: count };
  } catch {
    return { checked: false, authorizedSitesCount: 0 };
  }
}
