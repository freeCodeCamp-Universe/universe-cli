import { log } from "@clack/prompts";
import { CredentialError, UsageError } from "../errors.js";
import { clackDriver } from "../interaction/clack-driver.js";
import { silentDrive } from "../interaction/silent-driver.js";
import type { Step, StepResponse } from "../interaction/step.js";
import { DEFAULT_PROXY_URL } from "../lib/constants.js";
import { resolveIdentity as defaultResolveIdentity } from "../lib/identity.js";
import { defaultReadPlatformYaml, readAndParseConfig } from "../lib/read-platform-config.js";
import {
  AliasDriftError,
  createProxyClient as defaultCreateProxyClient,
  parseFetchTimeoutMs,
  type ProxyClient,
  type ProxyClientConfig,
} from "../lib/proxy-client.js";
import type { CommandResult } from "../output/command-result.js";
import { buildEnvelope } from "../output/envelope.js";
import { exitWithCode } from "../output/exit-codes.js";
import { emitJson, outputError } from "../output/format.js";

interface StaticRollbackOptions {
  to: string | undefined;
}

interface StaticRollbackSdkDeps {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  readPlatformYaml?: (cwd: string) => Promise<string>;
  resolveIdentity?: typeof defaultResolveIdentity;
  createProxyClient?: (cfg: ProxyClientConfig) => ProxyClient;
}

interface StaticRollbackHandlerOptions {
  json: boolean;
  to: string | undefined;
}

interface StaticRollbackHandlerDeps extends StaticRollbackSdkDeps {
  logSuccess?: (msg: string) => void;
  logError?: (msg: string) => void;
  exit?: (code: number) => void;
}

/** Roll the production alias back to a prior deploy. Yields confirm on alias drift. */
async function* staticRollback(
  options: StaticRollbackOptions,
  deps: StaticRollbackSdkDeps = {},
): AsyncGenerator<Step, CommandResult, StepResponse> {
  if (!options.to || options.to.trim().length === 0) {
    throw new UsageError(
      "rollback requires --to <deployId>. Run `universe static ls` to list past deploys.",
    );
  }

  const cwd = deps.cwd ?? process.cwd();
  const env = deps.env ?? process.env;
  const readYaml = deps.readPlatformYaml ?? defaultReadPlatformYaml;
  const resolveId = deps.resolveIdentity ?? defaultResolveIdentity;
  const mkClient = deps.createProxyClient ?? defaultCreateProxyClient;

  const identity = await resolveId({ env });
  if (!identity) {
    throw new CredentialError(
      "No GitHub identity available. Run `universe login`, set $GITHUB_TOKEN, or install the gh CLI.",
    );
  }

  const config = await readAndParseConfig(cwd, readYaml);

  const baseUrl = env["UNIVERSE_PROXY_URL"] ?? DEFAULT_PROXY_URL;
  const client = mkClient({
    baseUrl,
    getAuthToken: () => identity.token,
    timeoutMs: parseFetchTimeoutMs(env),
  });

  const to = options.to.trim();
  const prod = await client.getAlias({
    site: config.site,
    mode: "production",
  });
  const initialExpected = prod?.deployId ?? "";
  let result: { url: string; deployId: string };
  try {
    result = await client.siteRollback({
      site: config.site,
      to,
      expectedCurrent: initialExpected,
    });
  } catch (err) {
    if (!(err instanceof AliasDriftError)) throw err;
    yield { type: "warning", message: `drift: production moved to ${err.current}, expected ${initialExpected}` };
    const retry = (yield {
      type: "confirm",
      field: "drift-retry",
      message: `Retry rollback with expectedCurrent='${err.current}'?`,
    }) as boolean;
    if (!retry) throw err;
    result = await client.siteRollback({
      site: config.site,
      to,
      expectedCurrent: err.current,
    });
  }

  const format = [
    `Rolled production back to ${result.deployId}`,
    ``,
    `  Site:        ${config.site}`,
    `  Deploy:      ${result.deployId}`,
    `  Production:  ${result.url}`,
  ].join("\n");

  return {
    data: buildEnvelope("rollback", true, {
      deployId: result.deployId,
      url: result.url,
      site: config.site,
      identitySource: identity.source,
    }),
    format,
  };
}

async function staticRollbackHandler(
  options: StaticRollbackHandlerOptions,
  deps: StaticRollbackHandlerDeps = {},
): Promise<void> {
  const success = deps.logSuccess ?? ((s: string) => log.success(s));
  const error = deps.logError ?? ((s: string) => log.error(s));
  const exit = deps.exit ?? exitWithCode;

  const sdkOpts: StaticRollbackOptions = { to: options.to };

  try {
    let result: CommandResult;
    if (options.json) {
      result = await silentDrive(staticRollback(sdkOpts, deps));
    } else {
      result = await clackDriver(staticRollback(sdkOpts, deps));
    }

    if (options.json) {
      emitJson(result.data);
    } else {
      success(result.format);
    }
  } catch (err) {
    const extras = err instanceof AliasDriftError ? { current: err.current } : undefined;
    exit(outputError({ json: options.json, command: "rollback" }, err, { logError: error, extras }));
  }
}

export { staticRollback, staticRollbackHandler };
export type {
  StaticRollbackOptions,
  StaticRollbackSdkDeps,
  StaticRollbackHandlerOptions,
  StaticRollbackHandlerDeps,
};
