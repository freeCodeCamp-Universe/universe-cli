import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { confirm, isCancel, log } from "@clack/prompts";
import { ConfigError, CredentialError } from "../errors.js";
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
import { buildEnvelope, buildErrorEnvelope } from "../output/envelope.js";
import { exitWithCode } from "../output/exit-codes.js";

export interface PromoteOptions {
  json: boolean;
  /** Promote a specific deploy id instead of the current preview alias. */
  from?: string;
}

export interface PromoteDeps {
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

export async function promote(
  options: PromoteOptions,
  deps: PromoteDeps = {},
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
      // Per ADR-016: artemis promote endpoint copies preview alias to
      // production. To promote a *specific* prior deploy id, the alias
      // must be rewritten directly — the rollback endpoint is the
      // server-side primitive for that. Same atomic single-PUT.
      // V7: CAS body-pin even on --from to keep zero bare callsites.
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
        if (options.json) throw err;
        error(
          `drift: production moved to ${err.current}, expected ${initialExpected}`,
        );
        const ok = await promptConfirm(
          `Retry promote --from with expectedCurrent='${err.current}'?`,
        );
        if (!ok) throw err;
        result = await client.siteRollback({
          site: config.site,
          to: options.from,
          expectedCurrent: err.current,
        });
      }
    } else {
      // G3 CAS body-pin: read both aliases first, then POST with
      // {deployId, expectedCurrent}. expectedCurrent === "" is the
      // documented "assert no prod yet" idiom for first-promote.
      const preview = await client.getAlias({
        site: config.site,
        mode: "preview",
      });
      if (preview === null) {
        throw new ConfigError(
          "no preview alias to promote — run `universe static deploy` first",
        );
      }
      const prod = await client.getAlias({
        site: config.site,
        mode: "production",
      });
      if (!options.json) {
        // Pre-promote echo (RFC §G Phase 1 row 1).
        success(
          `Promoting ${preview.deployId} → ${prod?.deployId ?? "<none>"}`,
        );
      }
      const initialExpected = prod?.deployId ?? "";
      try {
        result = await client.sitePromote({
          site: config.site,
          deployId: preview.deployId,
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
          `Retry promote with expectedCurrent='${err.current}'?`,
        );
        if (!ok) throw err;
        result = await client.sitePromote({
          site: config.site,
          deployId: preview.deployId,
          expectedCurrent: err.current,
        });
      }
    }

    if (options.json) {
      emitJson(
        buildEnvelope("promote", true, {
          deployId: result.deployId,
          url: result.url,
          site: config.site,
          identitySource: identity.source,
        }),
      );
    } else {
      const lines = [
        `Promoted ${result.deployId} to production`,
        ``,
        `  Site:        ${config.site}`,
        `  Deploy:      ${result.deployId}`,
        `  Production:  ${result.url}`,
      ];
      if (options.from) {
        // --from routes through siteRollback, which rewrites only the
        // production alias; preview body is whatever the last
        // finalize(preview) wrote. Surface the divergence so the
        // operator knows preview is now lagging prod.
        lines.push(``, "Preview alias unchanged.");
      }
      success(lines.join("\n"));
    }
  } catch (err) {
    const { code, message } = wrapProxyError("promote", err);
    if (options.json) {
      const envelope = buildErrorEnvelope("promote", code, message);
      if (err instanceof AliasDriftError) {
        // V3 additive: top-level `current` so scripted callers can
        // branch + supply a fresh expectedCurrent on next attempt.
        emitJson({ ...envelope, current: err.current });
      } else {
        emitJson(envelope);
      }
    } else {
      error(message);
    }
    exit(code);
  }
}
