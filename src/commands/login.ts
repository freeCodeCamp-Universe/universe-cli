import { log } from "@clack/prompts";
import { CredentialError } from "../errors.js";
import { clackDriver, drive } from "../interaction/clack-driver.js";
import type { Step, StepResponse } from "../interaction/step.js";
import { DEFAULT_GH_CLIENT_ID } from "../lib/constants.js";
import {
  requestDeviceCode as defaultRequestDeviceCode,
  pollDeviceToken as defaultPollDeviceToken,
  type RequestDeviceCodeOptions,
  type PollDeviceTokenOptions,
} from "../lib/device-flow.js";
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
import type { CommandResult } from "../output/command-result.js";
import { buildEnvelope } from "../output/envelope.js";
import { EXIT_CONFIRM, exitWithCode } from "../output/exit-codes.js";
import { emitJson, outputError } from "../output/format.js";

interface LoginOptions {
  force?: boolean;
}

interface LoginSdkDeps {
  requestDeviceCode?: (opts: RequestDeviceCodeOptions) => ReturnType<typeof defaultRequestDeviceCode>;
  pollDeviceToken?: (opts: PollDeviceTokenOptions) => ReturnType<typeof defaultPollDeviceToken>;
  saveToken?: typeof defaultSaveToken;
  loadToken?: typeof defaultLoadToken;
  createProxyClient?: (cfg: ProxyClientConfig) => ProxyClient;
  env?: NodeJS.ProcessEnv;
}

interface LoginHandlerOptions {
  json: boolean;
  force?: boolean;
}

interface LoginHandlerDeps extends LoginSdkDeps {
  logSuccess?: (msg: string) => void;
  logWarn?: (msg: string) => void;
  logError?: (msg: string) => void;
  exit?: (code: number) => void;
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

interface SelfCheckResult {
  checked: boolean;
  authorizedSitesCount: number;
  warning?: string;
}

async function postLoginSelfCheck(
  token: string,
  env: NodeJS.ProcessEnv,
  deps: LoginSdkDeps,
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
      return { checked: true, authorizedSitesCount: 0, warning: NO_SITES_WARNING };
    }
    return { checked: true, authorizedSitesCount: count };
  } catch {
    return { checked: false, authorizedSitesCount: 0 };
  }
}

/** Run the GitHub device-flow login and store the token. Yields info/progress/warning steps. */
async function* login(
  options: LoginOptions,
  deps: LoginSdkDeps = {},
): AsyncGenerator<Step, CommandResult, StepResponse> {
  const env = deps.env ?? process.env;
  const reqDeviceCode = deps.requestDeviceCode ?? defaultRequestDeviceCode;
  const pollToken = deps.pollDeviceToken ?? defaultPollDeviceToken;
  const save = deps.saveToken ?? defaultSaveToken;
  const load = deps.loadToken ?? defaultLoadToken;

  const envClientId = env["UNIVERSE_GH_CLIENT_ID"];
  const clientId =
    envClientId && envClientId.trim().length > 0 ? envClientId : DEFAULT_GH_CLIENT_ID;

  if (!options.force) {
    const existing = await load();
    if (existing) {
      yield {
        type: "warning",
        message:
          "Already logged in. Run `universe logout` first or pass --force to replace the stored token.",
      };
      return {
        data: buildEnvelope("login", false, {
          stored: false,
          error: {
            code: EXIT_CONFIRM,
            message:
              "Already logged in. Run `universe logout` first or pass --force to replace the stored token.",
          },
        }),
        format:
          "Already logged in. Run `universe logout` first or pass --force to replace the stored token.",
      };
    }
  }

  const deviceCode = await reqDeviceCode({ clientId, scope: DEFAULT_SCOPE });

  yield {
    type: "info",
    field: "device-code",
    message: [
      `Open ${deviceCode.verificationUri} in your browser`,
      `and enter code: ${deviceCode.userCode}`,
      `(code expires in ${Math.round(deviceCode.expiresIn / 60)} min)`,
    ].join("\n"),
    data: {
      userCode: deviceCode.userCode,
      verificationUri: deviceCode.verificationUri,
      expiresIn: deviceCode.expiresIn,
    },
  };

  yield { type: "progress", message: "Waiting for device authorization" };

  const token = await pollToken({
    clientId,
    deviceCode: deviceCode.device_code,
    interval: deviceCode.interval,
  });

  await save(token);

  const selfCheck = await postLoginSelfCheck(token, env, deps);

  if (selfCheck.checked && selfCheck.warning) {
    yield { type: "warning", message: selfCheck.warning };
  }

  return {
    data: buildEnvelope("login", true, {
      stored: true,
      ...(selfCheck.checked
        ? {
            authorizedSitesCount: selfCheck.authorizedSitesCount,
            ...(selfCheck.warning ? { warning: selfCheck.warning } : {}),
          }
        : {}),
    }),
    format: "Logged in. Token stored at ~/.config/universe-cli/token.",
  };
}



async function loginHandler(
  options: LoginHandlerOptions,
  deps: LoginHandlerDeps = {},
): Promise<void> {
  const success = deps.logSuccess ?? ((s: string) => log.success(s));
  const error = deps.logError ?? ((s: string) => log.error(s));
  const exit = deps.exit ?? exitWithCode;

  let result: CommandResult;
  try {
    const gen = login({ force: options.force }, deps);
    if (options.json) {
      // In JSON mode, intercept the device-code info step to emit it as a
      // separate JSON envelope (matching the pre-refactor behaviour).
      result = await drive(gen, async (step) => {
        if (step.type === "info" && step.field === "device-code" && step.data) {
          emitJson(
            buildEnvelope("login", true, {
              userCode: step.data.userCode,
              verificationUri: step.data.verificationUri,
              expiresIn: step.data.expiresIn,
              stored: false,
            }),
          );
        }
        return step.type === "confirm" ? false : undefined;
      }, () => {});
    } else {
      result = await clackDriver(gen);
    }
  } catch (err) {
    const credErr =
      err instanceof CredentialError
        ? err
        : new CredentialError(err instanceof Error ? err.message : String(err));
    exit(outputError({ json: options.json, command: "login" }, credErr, { logError: error }));
    return;
  }

  if (!result.data.success) {
    if (options.json) {
      emitJson(result.data);
    } else {
      error(result.format);
    }
    exit(EXIT_CONFIRM);
    return;
  }

  if (options.json) {
    emitJson(result.data);
  } else {
    success(result.format);
    const warning = result.data.warning as string | undefined;
    if (warning) {
      const warn = deps.logWarn ?? ((s: string) => log.warn(s));
      warn(warning);
    }
  }
}

export { login, loginHandler };
export type { LoginOptions, LoginSdkDeps, LoginHandlerOptions, LoginHandlerDeps };
