import { readFile as nodeReadFile } from "node:fs/promises";
import { join } from "node:path";
import type { IdentityResolver } from "../../auth/identity-resolver.port.js";
import { ConfigError, CredentialError, UsageError } from "../../errors/cli-errors.js";
import type { Logger } from "../../output/logger.js";
import { writeJson } from "../../output/write-json.js";
import { parsePlatformYaml } from "../../platform/platform-yaml-v2.js";
import type { ProxyClient } from "../../platform/proxy-client.port.js";
import type { HandlerResult } from "../create/index.js";

interface RollbackOptions {
  cwd: string;
  json: boolean;
  to: string | undefined;
}

interface RollbackDeps {
  identityResolver: IdentityResolver;
  logger: Logger;
  proxyClient: ProxyClient;
  readFile?: (path: string) => Promise<string>;
}

const defaultReadFileFn = (path: string): Promise<string> => nodeReadFile(path, "utf-8");

const handleRollback = async (
  opts: RollbackOptions,
  deps: RollbackDeps,
): Promise<HandlerResult> => {
  const { logger } = deps;
  const read = deps.readFile ?? defaultReadFileFn;
  const to = opts.to?.trim();

  // 1. Validate --to flag
  if (to === undefined || to === "") {
    throw new UsageError(
      "rollback requires --to <deployId>. Run `universe static ls` to list past deploys.",
    );
  }

  // 2. Resolve identity
  const identity = await deps.identityResolver.resolve();
  if (identity === null) {
    throw new CredentialError(
      "No GitHub identity available. Run `universe login`, set $GITHUB_TOKEN, or install the gh CLI.",
    );
  }

  // 3. Read and parse platform.yaml
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

  // 4. Rollback
  const result = await deps.proxyClient.siteRollback({ site: config.site, to });

  // 5. Emit output
  const summary = {
    deployId: result.deployId,
    identitySource: identity.source,
    site: config.site,
    url: result.url,
  };

  if (opts.json) {
    writeJson("static rollback", true, summary);
  } else {
    logger.success(
      [
        `Rolled production back to ${result.deployId}`,
        ``,
        `  Site:        ${config.site}`,
        `  Deploy:      ${result.deployId}`,
        `  Production:  ${result.url}`,
      ].join("\n"),
    );
  }

  return { exitCode: 0 };
};

export { handleRollback, type RollbackDeps, type RollbackOptions };
