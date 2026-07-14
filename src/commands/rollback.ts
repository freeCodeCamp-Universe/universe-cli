import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { confirm, isCancel, log } from "@clack/prompts";
import { ConfigError, CredentialError, UsageError } from "../errors.js";
import { DEFAULT_PROXY_URL } from "../lib/constants.js";
import { resolveIdentity as defaultResolveIdentity } from "../lib/identity.js";
import {
  parsePlatformYaml,
  type PlatformYamlV2,
} from "../lib/platform-yaml.js";
import {
  AliasDriftError,
  createProxyClient as defaultCreateProxyClient,
  parseFetchTimeoutMs,
  wrapProxyError,
  type ProxyClient,
  type ProxyClientConfig,
} from "../lib/proxy-client.js";
import { buildEnvelope } from "../output/envelope.js";
import { exitWithCode } from "../output/exit-codes.js";
import { emitJson, outputError } from "../output/format.js";

export interface RollbackOptions {
  json: boolean;
  to: string | undefined;
}

export interface RollbackDeps {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  readPlatformYaml?: (cwd: string) => Promise<string>;
  resolveIdentity?: typeof defaultResolveIdentity;
  createProxyClient?: (cfg: ProxyClientConfig) => ProxyClient;
  logSuccess?: (msg: string) => void;
  logError?: (msg: string) => void;
  exit?: (code: number) => never;
  promptConfirm?: (msg: string) => Promise<boolean>;
}

const defaultPromptConfirm = async (msg: string): Promise<boolean> => {
  const r = await confirm({ message: msg, initialValue: false });
  if (isCancel(r)) return false;
  return r === true;
};

const defaultReadPlatformYaml = async (cwd: string): Promise<string> => {
  return readFile(resolve(cwd, "platform.yaml"), "utf-8");
};

async function readAndParseConfig(
  cwd: string,
  read: (cwd: string) => Promise<string>,
): Promise<PlatformYamlV2> {
  let raw: string;
  try {
    raw = await read(cwd);
  } catch (err) {
    if (
      err instanceof Error &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      throw new ConfigError(
        `platform.yaml not found in ${cwd}. See docs/platform-yaml.md.`,
      );
    }
    throw err;
  }
  const r = parsePlatformYaml(raw);
  if (!r.ok) throw new ConfigError(r.error);
  return r.value;
}

export async function rollback(
  options: RollbackOptions,
  deps: RollbackDeps = {},
): Promise<void> {
  const cwd = deps.cwd ?? process.cwd();
  const env = deps.env ?? process.env;
  const readYaml = deps.readPlatformYaml ?? defaultReadPlatformYaml;
  const resolveId = deps.resolveIdentity ?? defaultResolveIdentity;
  const mkClient = deps.createProxyClient ?? defaultCreateProxyClient;
  const success = deps.logSuccess ?? ((s: string) => log.success(s));
  const error = deps.logError ?? ((s: string) => log.error(s));
  const exit = deps.exit ?? exitWithCode;
  const promptConfirm = deps.promptConfirm ?? defaultPromptConfirm;

  try {
    if (!options.to || options.to.trim().length === 0) {
      throw new UsageError(
        "rollback requires --to <deployId>. Run `universe static ls` to list past deploys.",
      );
    }

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
    // G3 CAS pre-flight: read production alias for expectedCurrent.
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
      // V4: single-shot retry on non-JSON only. JSON path falls through
      // to outer catch which renders the envelope with `current`.
      if (options.json) throw err;
      error(
        `drift: production moved to ${err.current}, expected ${initialExpected}`,
      );
      const ok = await promptConfirm(
        `Retry rollback with expectedCurrent='${err.current}'?`,
      );
      if (!ok) throw err;
      result = await client.siteRollback({
        site: config.site,
        to,
        expectedCurrent: err.current,
      });
    }

    if (options.json) {
      emitJson(
        buildEnvelope("rollback", true, {
          deployId: result.deployId,
          url: result.url,
          site: config.site,
          identitySource: identity.source,
        }),
      );
    } else {
      success(
        [
          `Rolled production back to ${result.deployId}`,
          ``,
          `  Site:        ${config.site}`,
          `  Deploy:      ${result.deployId}`,
          `  Production:  ${result.url}`,
        ].join("\n"),
      );
    }
  } catch (err) {
    const { code, message } = wrapProxyError("rollback", err);
    // V3 additive: top-level `current` so scripted callers can branch +
    // supply a fresh expectedCurrent on next attempt.
    const extras =
      err instanceof AliasDriftError ? { current: err.current } : undefined;
    outputError({ json: options.json, command: "rollback" }, code, message, {
      logError: error,
      extras,
    });
    exit(code);
  }
}
