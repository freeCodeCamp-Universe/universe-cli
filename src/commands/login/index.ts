import type { DeviceFlow } from "../../auth/device-flow.port.js";
import type { IdentityResolver } from "../../auth/identity-resolver.port.js";
import type { TokenStore } from "../../auth/token-store.port.js";
import { ConfirmError, CredentialError } from "../../errors/cli-errors.js";
import { DEFAULT_GH_CLIENT_ID } from "../../constants.js";
import type { Logger } from "../../output/logger.js";
import { writeJson } from "../../output/write-json.js";
import type { HandlerResult } from "../create/index.js";

interface LoginOptions {
  force: boolean;
  json: boolean;
}

interface LoginDeps {
  deviceFlow: DeviceFlow;
  identityResolver: IdentityResolver;
  logger: Logger;
  tokenStore: TokenStore;
}

const DEFAULT_SCOPE = "read:org user:email";

const handleLogin = async (opts: LoginOptions, deps: LoginDeps): Promise<HandlerResult> => {
  const { logger } = deps;

  // 1. Check for existing token unless --force
  if (!opts.force) {
    const existing = await deps.tokenStore.loadToken();
    if (existing !== null) {
      throw new ConfirmError("Already logged in. Use --force to re-authenticate.");
    }
  }

  // 2. Run device flow
  const raw = process.env["UNIVERSE_GH_CLIENT_ID"];
  const clientId = raw !== undefined && raw.trim().length > 0 ? raw.trim() : DEFAULT_GH_CLIENT_ID;
  let token: string;
  try {
    token = await deps.deviceFlow.run({
      clientId,
      onPrompt: ({ expiresIn, userCode, verificationUri }) => {
        if (opts.json) {
          writeJson("login", true, { expiresIn, userCode, verificationUri });
        } else {
          logger.info(
            [
              `Open ${verificationUri} in your browser`,
              `and enter code: ${userCode}`,
              `(code expires in ${Math.round(expiresIn / 60)} min)`,
            ].join("\n"),
          );
        }
      },
      scope: DEFAULT_SCOPE,
    });
  } catch (err) {
    throw new CredentialError(err instanceof Error ? err.message : String(err));
  }

  // 3. Persist token
  await deps.tokenStore.saveToken(token);

  // 4. Emit success
  if (opts.json) {
    writeJson("login", true, { stored: true });
  } else {
    logger.success("Logged in. Token stored at ~/.config/universe-cli/token.");
  }

  return { exitCode: 0 };
};

export { handleLogin, type LoginDeps, type LoginOptions };
