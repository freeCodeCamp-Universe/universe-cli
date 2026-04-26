import { log } from "@clack/prompts";
import {
  deleteToken as defaultDeleteToken,
  loadToken as defaultLoadToken,
} from "../lib/token-store.js";
import { buildEnvelope } from "../output/envelope.js";

export interface LogoutOptions {
  json: boolean;
}

export interface LogoutDeps {
  loadToken?: typeof defaultLoadToken;
  deleteToken?: typeof defaultDeleteToken;
  logSuccess?: (msg: string) => void;
  logInfo?: (msg: string) => void;
}

function emitJson(envelope: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(envelope) + "\n");
}

export async function logout(
  options: LogoutOptions,
  deps: LogoutDeps = {},
): Promise<void> {
  const load = deps.loadToken ?? defaultLoadToken;
  const del = deps.deleteToken ?? defaultDeleteToken;
  const success = deps.logSuccess ?? ((s: string) => log.success(s));
  const info = deps.logInfo ?? ((s: string) => log.info(s));

  const existing = await load();
  await del();

  if (options.json) {
    emitJson(buildEnvelope("logout", true, { removed: existing !== null }));
    return;
  }

  if (existing) {
    success("Logged out. Stored token removed.");
  } else {
    info("No token was stored. Nothing to remove.");
  }
}
