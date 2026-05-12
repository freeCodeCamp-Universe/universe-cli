import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { log } from "@clack/prompts";
import {
  CliError,
  ConfigError,
  CredentialError,
  GitError,
  PartialUploadError,
  StorageError,
} from "../errors.js";
import {
  getGitState as defaultGetGitState,
  type GitState,
} from "../deploy/git.js";
import { walkFiles as defaultWalkFiles } from "../deploy/walk.js";
import { runBuild as defaultRunBuild } from "../lib/build.js";
import { DEFAULT_PROXY_URL } from "../lib/constants.js";
import { resolveIdentity as defaultResolveIdentity } from "../lib/identity.js";
import { createIgnoreFilter } from "../lib/ignore.js";
import {
  parsePlatformYaml,
  type PlatformYamlV2,
} from "../lib/platform-yaml.js";
import { suggest } from "../lib/similarity.js";
import {
  createProxyClient as defaultCreateProxyClient,
  ProxyError,
  type ProxyClient,
  type ProxyClientConfig,
} from "../lib/proxy-client.js";
import { uploadFiles as defaultUploadFiles } from "../lib/upload.js";
import { buildEnvelope, buildErrorEnvelope } from "../output/envelope.js";
import { EXIT_USAGE, exitWithCode } from "../output/exit-codes.js";

export interface DeployOptions {
  json: boolean;
  promote?: boolean;
  /** Override `build.output` from platform.yaml (matches `--dir` flag). */
  dir?: string;
}

export interface DeployDeps {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  readPlatformYaml?: (cwd: string) => Promise<string>;
  resolveIdentity?: typeof defaultResolveIdentity;
  createProxyClient?: (cfg: ProxyClientConfig) => ProxyClient;
  getGitState?: () => GitState;
  runBuild?: typeof defaultRunBuild;
  walkFiles?: typeof defaultWalkFiles;
  uploadFiles?: typeof defaultUploadFiles;
  logSuccess?: (msg: string) => void;
  logInfo?: (msg: string) => void;
  logWarn?: (msg: string) => void;
  logError?: (msg: string) => void;
  exit?: (code: number) => never;
}

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

function syntheticSha(): string {
  return `nogit-${Date.now().toString(36)}`;
}

/**
 * Re-throws a proxy error with a prefixed message but preserves the
 * original status + code so the outer catch maps to the correct exit
 * code (401/403 → EXIT_CREDENTIALS, 422/5xx → EXIT_STORAGE).
 */
function rethrowProxy(prefix: string, err: unknown): never {
  if (err instanceof ProxyError) {
    throw new ProxyError(
      err.status,
      err.code,
      `${prefix} (${err.code}): ${err.message}`,
    );
  }
  if (err instanceof Error) throw new StorageError(`${prefix}: ${err.message}`);
  throw new StorageError(`${prefix}: ${String(err)}`);
}

/**
 * Cap on how many authorized slugs to render inline in the preflight
 * error body. Above this, the message shows the count + a one-line
 * `sites ls --mine` redirect — staff in broad teams (e.g. `staff` on
 * a registry with hundreds of slugs) would otherwise see a wall of
 * text. Did-you-mean stays inline regardless of size; it's the
 * primary typo-recovery surface.
 */
const PREFLIGHT_INLINE_LIST_CAP = 10;

/**
 * Formats the `site '<slug>' is not registered` preflight error.
 *
 * Body shape:
 *   - Did-you-mean hint when the attempted slug is close to an
 *     authorized one (substring / Damerau-Levenshtein ≤ 2). Always
 *     inline; it's the primary recovery surface for typos.
 *   - Three likely-cause lines naming the registry-CLI remediation
 *     (`universe sites register/update …`), staff-gated.
 *   - Authorized set: inline list when count ≤ `PREFLIGHT_INLINE_LIST_CAP`,
 *     otherwise count + `universe sites ls --mine` redirect.
 *
 * No external runbook redirect. Empty `authorized` collapses to a
 * shorter "no sites yet" body — suggesting a typo is misleading
 * when the user has no comparison set.
 */
function formatUnauthorizedSiteError(a: {
  attempted: string;
  login: string;
  authorized: readonly string[];
}): string {
  const lines: string[] = [
    `Site '${a.attempted}' is not registered for your GitHub identity.`,
    ``,
    `  You are:  ${a.login}`,
    ``,
  ];

  if (a.authorized.length === 0) {
    lines.push(
      `  Your identity is authorized for no sites yet.`,
      ``,
      `  Likely causes:`,
      `    1. The '${a.attempted}' slug is not registered.`,
      `       Admin (staff): universe sites register ${a.attempted} --team <team>`,
      `    2. You are not in any team listed on any registered site.`,
      `       Admin (staff): universe sites update <slug> --team +<your-team>`,
    );
    return lines.join("\n");
  }

  const hint = suggest(a.attempted, a.authorized);
  if (hint) {
    lines.push(`  Did you mean: ${hint}?`, ``);
  }

  lines.push(
    `  Likely causes (most common first):`,
    `    1. Typo in platform.yaml \`site:\` — check the spelling above.`,
    `    2. The '${a.attempted}' slug is not registered yet.`,
    `       Admin (staff): universe sites register ${a.attempted} --team <team>`,
    `    3. You are not in any team authorized for '${a.attempted}'.`,
    `       Admin (staff): universe sites update ${a.attempted} --team +<your-team>`,
    ``,
  );

  if (a.authorized.length <= PREFLIGHT_INLINE_LIST_CAP) {
    lines.push(
      `  Your authorized sites (${a.authorized.length}):`,
      ...[...a.authorized].sort().map((s) => `    - ${s}`),
    );
  } else {
    lines.push(
      `  You have ${a.authorized.length} authorized sites — too many to inline.`,
      `  Run \`universe sites ls --mine\` to inspect the full list.`,
    );
  }

  return lines.join("\n");
}

export async function deploy(
  options: DeployOptions,
  deps: DeployDeps = {},
): Promise<void> {
  const cwd = deps.cwd ?? process.cwd();
  const env = deps.env ?? process.env;
  const readYaml = deps.readPlatformYaml ?? defaultReadPlatformYaml;
  const resolveId = deps.resolveIdentity ?? defaultResolveIdentity;
  const mkClient = deps.createProxyClient ?? defaultCreateProxyClient;
  const gitState = deps.getGitState ?? defaultGetGitState;
  const build = deps.runBuild ?? defaultRunBuild;
  const walk = deps.walkFiles ?? defaultWalkFiles;
  const upload = deps.uploadFiles ?? defaultUploadFiles;
  const success = deps.logSuccess ?? ((s: string) => log.success(s));
  const info = deps.logInfo ?? ((s: string) => log.info(s));
  const warn = deps.logWarn ?? ((s: string) => log.warn(s));
  const error = deps.logError ?? ((s: string) => log.error(s));
  const exit = deps.exit ?? exitWithCode;

  try {
    // 1. Identity.
    const identity = await resolveId({ env });
    if (!identity) {
      throw new CredentialError(
        "No GitHub identity available. Run `universe login`, set $GITHUB_TOKEN, or install the gh CLI.",
      );
    }

    // 2. Config.
    const config = await readAndParseConfig(cwd, readYaml);

    // 3. Proxy client (early so preflight can run before the slow build).
    const baseUrl = env["UNIVERSE_PROXY_URL"] ?? DEFAULT_PROXY_URL;
    const client = mkClient({
      baseUrl,
      getAuthToken: () => identity.token,
    });

    // 4. Preflight authorization. Catches the most common staff-side
    // failure (`site_unauthorized`) BEFORE running the build, and
    // surfaces the registry-CLI remediation inline (typo hint +
    // authorized list + `universe sites register/update` commands).
    // One GET; cheap.
    let me;
    try {
      me = await client.whoami();
    } catch (err) {
      rethrowProxy("whoami preflight failed", err);
    }
    if (!me.authorizedSites.includes(config.site)) {
      throw new CredentialError(
        formatUnauthorizedSiteError({
          attempted: config.site,
          login: me.login,
          authorized: me.authorizedSites,
        }),
      );
    }

    // 5. Git state (informational).
    const git = gitState();
    if (git.dirty && !options.json) {
      warn(
        "git working tree is dirty — uncommitted changes will not be reflected.",
      );
    }
    const sha = git.hash ?? syntheticSha();

    // 6. Build.
    const outputDir = options.dir ?? config.build.output;
    const buildResult = await build({
      command: config.build.command,
      cwd,
      outputDir,
    });
    if (buildResult.skipped && !options.json) {
      info("build.command not set — using pre-built output.");
    }
    const resolvedOutputDir = buildResult.outputDir;

    // 7. Walk + ignore.
    const walked = walk(resolvedOutputDir);
    const ignore = createIgnoreFilter(config.deploy.ignore);
    const filtered = walked.filter((f) => !ignore(f.relPath));
    if (filtered.length === 0) {
      throw new GitError(`No files to deploy under ${resolvedOutputDir}.`);
    }
    const fileList = filtered.map((f) => f.relPath);

    // 8. Init.
    let initResult;
    try {
      initResult = await client.deployInit({
        site: config.site,
        sha,
        files: fileList,
      });
    } catch (err) {
      rethrowProxy("deploy init failed", err);
    }

    // 8. Upload.
    const uploadResult = await upload({
      client,
      deployId: initResult.deployId,
      jwt: initResult.jwt,
      files: filtered,
    });
    if (uploadResult.errors.length > 0) {
      const message = `Upload partially failed: ${uploadResult.errors.length} file(s) failed:\n  - ${uploadResult.errors.join("\n  - ")}`;
      // EXIT_PARTIAL is dedicated; throw a CliError that maps to it.
      throw new PartialUploadError(message);
    }

    // 9. Finalize.
    const mode: "preview" | "production" = options.promote
      ? "production"
      : "preview";
    let finalizeResult;
    try {
      finalizeResult = await client.deployFinalize({
        deployId: initResult.deployId,
        jwt: initResult.jwt,
        mode,
        files: fileList,
      });
    } catch (err) {
      rethrowProxy("deploy finalize failed", err);
    }

    // 10. Output.
    if (options.json) {
      emitJson(
        buildEnvelope("deploy", true, {
          deployId: finalizeResult.deployId,
          url: finalizeResult.url,
          mode: finalizeResult.mode,
          site: config.site,
          sha,
          fileCount: uploadResult.fileCount,
          totalSize: uploadResult.totalSize,
          identitySource: identity.source,
        }),
      );
    } else {
      const sizeKB = (uploadResult.totalSize / 1024).toFixed(1);
      const nextLine =
        mode === "preview"
          ? `Next: universe static promote --from ${finalizeResult.deployId}`
          : "Promoted to production.";
      success(
        [
          `Deployed ${finalizeResult.deployId}`,
          ``,
          `  Site:     ${config.site}`,
          `  Files:    ${uploadResult.fileCount}`,
          `  Size:     ${sizeKB} KB`,
          `  Mode:     ${mode}`,
          `  URL:      ${finalizeResult.url}`,
          ``,
          nextLine,
        ].join("\n"),
      );
    }
  } catch (err) {
    let code: number;
    let message: string;
    if (err instanceof ProxyError) {
      code = err.exitCode;
      message = err.message;
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
      emitJson(buildErrorEnvelope("deploy", code, message));
    } else {
      error(message);
    }
    exit(code);
  }
}
