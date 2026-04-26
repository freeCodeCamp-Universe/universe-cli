import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { log } from "@clack/prompts";
import { CliError, ConfigError, CredentialError } from "../errors.js";
import { resolveIdentity as defaultResolveIdentity } from "../lib/identity.js";
import {
  parsePlatformYaml,
  type PlatformYamlV2,
} from "../lib/platform-yaml.js";
import {
  createProxyClient as defaultCreateProxyClient,
  ProxyError,
  type ProxyClient,
  type ProxyClientConfig,
} from "../lib/proxy-client.js";
import { buildEnvelope, buildErrorEnvelope } from "../output/envelope.js";
import { EXIT_USAGE, exitWithCode } from "../output/exit-codes.js";

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
  exit?: (code: number, message?: string) => never;
}

const DEFAULT_PROXY_URL = "https://uploads.freecode.camp";

const defaultReadPlatformYaml = async (cwd: string): Promise<string> => {
  return readFile(resolve(cwd, "platform.yaml"), "utf-8");
};

function emitJson(envelope: object): void {
  process.stdout.write(JSON.stringify(envelope) + "\n");
}

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

class UsageError extends CliError {
  readonly exitCode = EXIT_USAGE;
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
    });

    const result = await client.siteRollback({
      site: config.site,
      to: options.to.trim(),
    });

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
    let code: number;
    let message: string;
    if (err instanceof ProxyError) {
      code = err.exitCode;
      message = `rollback failed (${err.code}): ${err.message}`;
    } else if (err instanceof CliError) {
      code = err.exitCode;
      message = err.message;
    } else if (err instanceof Error) {
      code = EXIT_USAGE;
      message = err.message;
    } else {
      code = EXIT_USAGE;
      message = String(err);
    }
    if (options.json) {
      emitJson(buildErrorEnvelope("rollback", code, message));
    } else {
      error(message);
    }
    exit(code, message);
  }
}
