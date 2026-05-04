import { readFile as nodeReadFile } from "node:fs/promises";
import { join } from "node:path";
import type { IdentityResolver } from "../../auth/identity-resolver.port.js";
import { ConfigError, CredentialError } from "../../errors/cli-errors.js";
import type { Logger } from "../../output/logger.js";
import { writeJson } from "../../output/write-json.js";
import { parsePlatformYaml } from "../../platform/platform-yaml-v2.js";
import type { ProxyClient } from "../../platform/proxy-client.port.js";
import type { HandlerResult } from "../create/index.js";

interface PromoteOptions {
  cwd: string;
  from?: string;
  json: boolean;
}

interface PromoteDeps {
  identityResolver: IdentityResolver;
  logger: Logger;
  proxyClient: ProxyClient;
  readFile?: (path: string) => Promise<string>;
}

const defaultReadFileFn = (path: string): Promise<string> => nodeReadFile(path, "utf-8");

const handlePromote = async (opts: PromoteOptions, deps: PromoteDeps): Promise<HandlerResult> => {
  const { logger } = deps;
  const read = deps.readFile ?? defaultReadFileFn;

  // 1. Resolve identity
  const identity = await deps.identityResolver.resolve();
  if (identity === null) {
    throw new CredentialError(
      "No GitHub identity available. Run `universe login`, set $GITHUB_TOKEN, or install the gh CLI.",
    );
  }

  // 2. Read and parse platform.yaml
  let rawYaml: string;
  try {
    rawYaml = await read(join(opts.cwd, "platform.yaml"));
  } catch {
    throw new ConfigError(
      "platform.yaml not found. Run this command from the project root containing platform.yaml.",
    );
  }

  const parseResult = parsePlatformYaml(rawYaml);
  if (!parseResult.ok) {
    throw new ConfigError(parseResult.error);
  }
  const config = parseResult.value;

  // 3. Promote
  // Per ADR-016: artemis promote endpoint copies preview alias to
  // production. To promote a *specific* prior deploy id, the alias
  // must be rewritten directly — the rollback endpoint is the
  // server-side primitive for that. Same atomic single-PUT.
  const result =
    opts.from === undefined
      ? await deps.proxyClient.sitePromote({ site: config.site })
      : await deps.proxyClient.siteRollback({ site: config.site, to: opts.from });

  // 4. Emit output
  const summary = {
    deployId: result.deployId,
    identitySource: identity.source,
    site: config.site,
    url: result.url,
  };

  if (opts.json) {
    writeJson("promote", true, summary);
  } else {
    logger.success(
      [
        `Promoted ${result.deployId} to production`,
        ``,
        `  Site:        ${config.site}`,
        `  Deploy:      ${result.deployId}`,
        `  Production:  ${result.url}`,
      ].join("\n"),
    );
  }

  return { exitCode: 0 };
};

export { handlePromote, type PromoteDeps, type PromoteOptions };
