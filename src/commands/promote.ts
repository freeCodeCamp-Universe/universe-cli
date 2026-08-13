import { log } from "@clack/prompts";
import { ConfigError, CredentialError } from "../errors.js";
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

interface StaticPromoteOptions {
  from?: string;
}

interface StaticPromoteSdkDeps {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  readPlatformYaml?: (cwd: string) => Promise<string>;
  resolveIdentity?: typeof defaultResolveIdentity;
  createProxyClient?: (cfg: ProxyClientConfig) => ProxyClient;
}

interface StaticPromoteHandlerOptions {
  json: boolean;
  from?: string;
}

interface StaticPromoteHandlerDeps extends StaticPromoteSdkDeps {
  logSuccess?: (msg: string) => void;
  logError?: (msg: string) => void;
  exit?: (code: number) => void;
}

/** Promote the current preview deploy to production. Yields confirm on alias drift. */
async function* staticPromote(
  options: StaticPromoteOptions,
  deps: StaticPromoteSdkDeps = {},
): AsyncGenerator<Step, CommandResult, StepResponse> {
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

  let result: { url: string; deployId: string };
  if (options.from) {
    const prod = await client.getAlias({
      site: config.site,
      mode: "production",
    });
    const initialExpected = prod?.deployId ?? "";
    try {
      result = await client.siteRollback({
        site: config.site,
        to: options.from,
        expectedCurrent: initialExpected,
      });
    } catch (err) {
      if (!(err instanceof AliasDriftError)) throw err;
      yield { type: "warning", message: `drift: production moved to ${err.current}, expected ${initialExpected}` };
      const retry = (yield {
        type: "confirm",
        field: "drift-retry",
        message: `Retry promote --from with expectedCurrent='${err.current}'?`,
      }) as boolean;
      if (!retry) throw err;
      result = await client.siteRollback({
        site: config.site,
        to: options.from,
        expectedCurrent: err.current,
      });
    }
  } else {
    const preview = await client.getAlias({
      site: config.site,
      mode: "preview",
    });
    if (preview === null) {
      throw new ConfigError("no preview alias to promote — run `universe static deploy` first");
    }
    const prod = await client.getAlias({
      site: config.site,
      mode: "production",
    });
    yield { type: "info", message: `Promoting ${preview.deployId} → ${prod?.deployId ?? "<none>"}` };
    const initialExpected = prod?.deployId ?? "";
    try {
      result = await client.sitePromote({
        site: config.site,
        deployId: preview.deployId,
        expectedCurrent: initialExpected,
      });
    } catch (err) {
      if (!(err instanceof AliasDriftError)) throw err;
      yield { type: "warning", message: `drift: production moved to ${err.current}, expected ${initialExpected}` };
      const retry = (yield {
        type: "confirm",
        field: "drift-retry",
        message: `Retry promote with expectedCurrent='${err.current}'?`,
      }) as boolean;
      if (!retry) throw err;
      result = await client.sitePromote({
        site: config.site,
        deployId: preview.deployId,
        expectedCurrent: err.current,
      });
    }
  }

  const lines = [
    `Promoted ${result.deployId} to production`,
    ``,
    `  Site:        ${config.site}`,
    `  Deploy:      ${result.deployId}`,
    `  Production:  ${result.url}`,
  ];
  if (options.from) {
    lines.push(``, "Preview alias unchanged.");
  }

  return {
    data: buildEnvelope("promote", true, {
      deployId: result.deployId,
      url: result.url,
      site: config.site,
      identitySource: identity.source,
    }),
    format: lines.join("\n"),
  };
}

async function staticPromoteHandler(
  options: StaticPromoteHandlerOptions,
  deps: StaticPromoteHandlerDeps = {},
): Promise<void> {
  const success = deps.logSuccess ?? ((s: string) => log.success(s));
  const error = deps.logError ?? ((s: string) => log.error(s));
  const exit = deps.exit ?? exitWithCode;

  const sdkOpts: StaticPromoteOptions = { from: options.from };

  try {
    let result: CommandResult;
    if (options.json) {
      result = await silentDrive(staticPromote(sdkOpts, deps));
    } else {
      result = await clackDriver(staticPromote(sdkOpts, deps));
    }

    if (options.json) {
      emitJson(result.data);
    } else {
      success(result.format);
    }
  } catch (err) {
    const extras = err instanceof AliasDriftError ? { current: err.current } : undefined;
    exit(outputError({ json: options.json, command: "promote" }, err, { logError: error, extras }));
  }
}

export { staticPromote, staticPromoteHandler };
export type {
  StaticPromoteOptions,
  StaticPromoteSdkDeps,
  StaticPromoteHandlerOptions,
  StaticPromoteHandlerDeps,
};
