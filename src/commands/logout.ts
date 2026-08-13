import { log } from "@clack/prompts";
import {
  deleteToken as defaultDeleteToken,
  loadToken as defaultLoadToken,
} from "../lib/token-store.js";
import type { CommandResult } from "../output/command-result.js";
import { buildEnvelope } from "../output/envelope.js";
import { emitJson, outputError } from "../output/format.js";
import { exitWithCode } from "../output/exit-codes.js";

interface LogoutDeps {
  loadToken?: typeof defaultLoadToken;
  deleteToken?: typeof defaultDeleteToken;
}

interface LogoutHandlerDeps extends LogoutDeps {
  logSuccess?: (msg: string) => void;
  logInfo?: (msg: string) => void;
  exit?: (code: number) => void;
}

interface LogoutHandlerOptions {
  json: boolean;
}

/** Remove the stored device-flow token. Returns `{ removed: boolean }`. */
async function logout(deps: LogoutDeps = {}): Promise<CommandResult> {
  const load = deps.loadToken ?? defaultLoadToken;
  const del = deps.deleteToken ?? defaultDeleteToken;

  const existing = await load();
  await del();

  const removed = existing !== null;
  const format = removed
    ? "Logged out. Stored token removed."
    : "No token was stored. Nothing to remove.";

  return {
    data: buildEnvelope("logout", true, { removed }),
    format,
  };
}

async function logoutHandler(
  options: LogoutHandlerOptions,
  deps: LogoutHandlerDeps = {},
): Promise<void> {
  const success = deps.logSuccess ?? ((s: string) => log.success(s));
  const info = deps.logInfo ?? ((s: string) => log.info(s));
  const exit = deps.exit ?? exitWithCode;

  try {
    const result = await logout(deps);

    if (options.json) {
      emitJson(result.data);
      return;
    }

    if (result.data.removed) {
      success(result.format);
    } else {
      info(result.format);
    }
  } catch (err) {
    exit(outputError({ json: options.json, command: "logout" }, err, { logError: (s) => log.error(s) }));
  }
}

export { logout, logoutHandler };
export type { LogoutDeps, LogoutHandlerDeps, LogoutHandlerOptions };
