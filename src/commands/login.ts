import { log } from "@clack/prompts";
import { DEFAULT_GH_CLIENT_ID } from "../lib/constants.js";
import { runDeviceFlow as defaultRunDeviceFlow } from "../lib/device-flow.js";
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

export interface LoginOptions {
  json: boolean;
  force?: boolean;
}

export interface LoginDeps {
  runDeviceFlow?: typeof defaultRunDeviceFlow;
  saveToken?: typeof defaultSaveToken;
  loadToken?: typeof defaultLoadToken;
  env?: NodeJS.ProcessEnv;
  logSuccess?: (msg: string) => void;
  logInfo?: (msg: string) => void;
  logError?: (msg: string) => void;
  exit?: (code: number, message?: string) => never;
}

const DEFAULT_SCOPE = "read:org user:email";

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
      exit(EXIT_CONFIRM, msg);
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
    if (options.json) {
      emitJson({
        schemaVersion: "1",
        command: "login",
        success: false,
        timestamp: new Date().toISOString(),
        error: { code: EXIT_CREDENTIALS, message },
      });
    } else {
      error(message);
    }
    exit(EXIT_CREDENTIALS, message);
    return;
  }

  await save(token);

  if (options.json) {
    emitJson(buildEnvelope("login", true, { stored: true }));
  } else {
    success("Logged in. Token stored at ~/.config/universe-cli/token.");
  }
}
