import type { TokenStore } from "../../auth/token-store.port.js";
import type { Logger } from "../../output/logger.js";
import { writeJson } from "../../output/write-json.js";
import type { HandlerResult } from "../create/index.js";

interface LogoutOptions {
  json: boolean;
}

interface LogoutDeps {
  logger: Logger;
  tokenStore: TokenStore;
}

const handleLogout = async (opts: LogoutOptions, deps: LogoutDeps): Promise<HandlerResult> => {
  const { logger } = deps;

  const removed = (await deps.tokenStore.loadToken()) !== null;

  await deps.tokenStore.deleteToken();

  if (opts.json) {
    writeJson("logout", true, { removed });
  } else if (removed) {
    logger.success("Logged out. Stored token removed.");
  } else {
    logger.info("No token was stored. Nothing to remove.");
  }

  return { exitCode: 0 };
};

export { handleLogout, type LogoutDeps, type LogoutOptions };
