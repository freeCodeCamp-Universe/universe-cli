import type { IdentityResolver } from "../../auth/identity-resolver.port.js";
import { CredentialError } from "../../errors/cli-errors.js";
import type { Logger } from "../../output/logger.js";
import { wrapProxyError } from "../../platform/proxy-client.port.js";
import type { ProxyClient, WhoAmIResponse } from "../../platform/proxy-client.port.js";
import { writeErrorJson, writeJson } from "../../output/write-json.js";
import type { HandlerResult } from "../create/index.js";

interface WhoamiOptions {
  json: boolean;
}

interface WhoamiDeps {
  identityResolver: IdentityResolver;
  logger: Logger;
  proxyClient: ProxyClient;
}

const handleWhoami = async (opts: WhoamiOptions, deps: WhoamiDeps): Promise<HandlerResult> => {
  const { logger } = deps;

  // 1. Resolve identity
  const identity = await deps.identityResolver.resolve();
  if (identity === null) {
    throw new CredentialError("Not authenticated. Run `universe login` first.");
  }

  // 2. Fetch whoami
  let me: WhoAmIResponse;
  try {
    me = await deps.proxyClient.whoami();
  } catch (err) {
    if (opts.json) {
      const { code, message } = wrapProxyError("whoami", err);
      writeErrorJson("whoami", code, message);
    }
    throw err;
  }

  // 3. Emit output
  if (opts.json) {
    writeJson("whoami", true, {
      authorizedSites: me.authorizedSites,
      identitySource: identity.source,
      login: me.login,
    });
  } else {
    const sites =
      me.authorizedSites.length > 0 ? me.authorizedSites.join(", ") : "(no sites authorized)";

    logger.success(
      [
        `Logged in as: ${me.login}`,
        `Authorized sites: ${sites}`,
        `Identity source: ${identity.source}`,
      ].join("\n"),
    );
  }

  return { exitCode: 0 };
};

export { handleWhoami, type WhoamiDeps, type WhoamiOptions };
