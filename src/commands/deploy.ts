import { log } from "@clack/prompts";
import {
  CredentialError,
  GitError,
  PartialUploadError,
  StorageError,
} from "../errors.js";
import { getGitState as defaultGetGitState, type GitState } from "../deploy/git.js";
import { hasRootIndex, missingRootIndexMessage } from "../deploy/index-check.js";
import { clackDriver } from "../interaction/clack-driver.js";
import { silentDrive } from "../interaction/silent-driver.js";
import type { Step, StepResponse } from "../interaction/step.js";
import { walkFiles as defaultWalkFiles } from "../deploy/walk.js";
import { runBuild as defaultRunBuild } from "../lib/build.js";
import { DEFAULT_PROXY_URL } from "../lib/constants.js";
import { resolveIdentity as defaultResolveIdentity } from "../lib/identity.js";
import { createIgnoreFilter } from "../lib/ignore.js";
import { defaultReadPlatformYaml, readAndParseConfig } from "../lib/read-platform-config.js";
import { suggest } from "../lib/similarity.js";
import {
  createProxyClient as defaultCreateProxyClient,
  parseFetchTimeoutMs,
  ProxyError,
  type ProxyClient,
  type ProxyClientConfig,
} from "../lib/proxy-client.js";
import { uploadFiles as defaultUploadFiles } from "../lib/upload.js";
import type { CommandResult } from "../output/command-result.js";
import { buildEnvelope } from "../output/envelope.js";
import { exitWithCode } from "../output/exit-codes.js";
import { emitJson, outputError } from "../output/format.js";

interface StaticDeployOptions {
  promote?: boolean;
  /** Override `build.output` from platform.yaml (matches `--dir` flag). */
  dir?: string;
}

interface StaticDeploySdkDeps {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  readPlatformYaml?: (cwd: string) => Promise<string>;
  resolveIdentity?: typeof defaultResolveIdentity;
  createProxyClient?: (cfg: ProxyClientConfig) => ProxyClient;
  getGitState?: () => GitState;
  runBuild?: typeof defaultRunBuild;
  walkFiles?: typeof defaultWalkFiles;
  uploadFiles?: typeof defaultUploadFiles;
  onProgress?: (progress: { uploaded: number; total: number; current: string }) => void;
}

interface StaticDeployHandlerOptions {
  json: boolean;
  promote?: boolean;
  /** Override `build.output` from platform.yaml (matches `--dir` flag). */
  dir?: string;
}

interface StaticDeployHandlerDeps extends StaticDeploySdkDeps {
  logSuccess?: (msg: string) => void;
  logError?: (msg: string) => void;
  exit?: (code: number) => void;
}

function syntheticSha(): string {
  return `nogit-${Date.now().toString(36)}`;
}

function deployIdSha(deployId: string): string | null {
  const m = /^\d{8}-\d{6}-(\S+)$/.exec(deployId);
  return m?.[1] ?? null;
}

/**
 * Re-throws a proxy error with a prefixed message but preserves the
 * original status, code, requestId, and hint so the outer catch can
 * delegate to `outputError` for consistent formatting.
 */
function rethrowProxy(prefix: string, err: unknown): never {
  if (err instanceof ProxyError) {
    throw new ProxyError(
      err.status,
      err.code,
      `${prefix}: ${err.message}`,
      err.requestId,
      err.hint,
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
 *     authorized one (substring / Damerau-Levenshtein <= 2). Always
 *     inline; it's the primary recovery surface for typos.
 *   - Three likely-cause lines naming the registry-CLI remediation
 *     (`universe sites register/update ...`), staff-gated.
 *   - Authorized set: inline list when count <= `PREFLIGHT_INLINE_LIST_CAP`,
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



/** Build, upload, and finalize a static site deploy. Yields progress/warning/info steps. */
async function* staticDeploy(
  options: StaticDeployOptions,
  deps: StaticDeploySdkDeps = {},
): AsyncGenerator<Step, CommandResult, StepResponse> {
  const cwd = deps.cwd ?? process.cwd();
  const env = deps.env ?? process.env;
  const readYaml = deps.readPlatformYaml ?? defaultReadPlatformYaml;
  const resolveId = deps.resolveIdentity ?? defaultResolveIdentity;
  const mkClient = deps.createProxyClient ?? defaultCreateProxyClient;
  const gitState = deps.getGitState ?? defaultGetGitState;
  const build = deps.runBuild ?? defaultRunBuild;
  const walk = deps.walkFiles ?? defaultWalkFiles;
  const upload = deps.uploadFiles ?? defaultUploadFiles;

  const identity = await resolveId({ env });
  if (!identity) {
    throw new CredentialError(
      "No GitHub identity available. Run `universe login`, set $GITHUB_TOKEN, or install the gh CLI.",
    );
  }

  const config = await readAndParseConfig(cwd, readYaml);

  // Proxy client built early so preflight can run before the slow build.
  const baseUrl = env["UNIVERSE_PROXY_URL"] ?? DEFAULT_PROXY_URL;
  const client = mkClient({
    baseUrl,
    getAuthToken: () => identity.token,
    timeoutMs: parseFetchTimeoutMs(env),
  });

  // Preflight authorization. Catches the most common staff-side
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

  const git = gitState();
  if (git.dirty) {
    yield { type: "warning", message: "git working tree is dirty — uncommitted changes will not be reflected." };
  }
  const sha = git.hash ?? syntheticSha();

  if (options.promote && !git.dirty && git.hash) {
    let preview: { deployId: string } | null = null;
    try {
      preview = await client.getAlias({
        site: config.site,
        mode: "preview",
      });
    } catch {
      preview = null;
    }
    const previewSha = preview ? deployIdSha(preview.deployId) : null;
    if (preview && previewSha && git.hash.startsWith(previewSha)) {
      let promoted;
      try {
        promoted = await client.sitePromote({
          site: config.site,
          deployId: preview.deployId,
        });
      } catch (err) {
        rethrowProxy("promote existing preview failed", err);
      }

      yield {
        type: "info",
        message: `Preview was already at this commit (${previewSha}); skipped rebuild and re-upload.`,
      };

      return {
        data: buildEnvelope("deploy", true, {
          deployId: promoted.deployId,
          url: promoted.url,
          mode: "production",
          site: config.site,
          sha,
          reusedPreview: true,
          identitySource: identity.source,
        }),
        format: [
          `Promoted existing preview ${promoted.deployId} to production`,
          ``,
          `  Site:        ${config.site}`,
          `  Deploy:      ${promoted.deployId}`,
          `  Production:  ${promoted.url}`,
          ``,
          `Preview was already at this commit (${previewSha}); skipped rebuild and re-upload.`,
        ].join("\n"),
      };
    }
  }

  const outputDir = options.dir ?? config.build.output;
  const buildResult = await build({
    command: config.build.command,
    cwd,
    outputDir,
  });
  if (buildResult.skipped) {
    yield { type: "info", message: "build.command not set — using pre-built output." };
  }
  const resolvedOutputDir = buildResult.outputDir;

  const walked = walk(resolvedOutputDir);
  const ignore = createIgnoreFilter(config.deploy.ignore);
  const filtered = walked.filter((f) => !ignore(f.relPath));
  if (filtered.length === 0) {
    throw new GitError(`No files to deploy under ${resolvedOutputDir}.`);
  }
  const fileList = filtered.map((f) => f.relPath);
  if (!hasRootIndex(fileList)) {
    throw new StorageError(missingRootIndexMessage(fileList, resolvedOutputDir));
  }

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

  yield { type: "progress", message: `Uploading 0/${filtered.length} files` };
  const uploadResult = await upload({
    client,
    deployId: initResult.deployId,
    jwt: initResult.jwt,
    files: filtered,
    onProgress: deps.onProgress,
  });
  if (uploadResult.errors.length > 0) {
    const message = `Upload partially failed: ${uploadResult.errors.length} file(s) failed:\n  - ${uploadResult.errors.join("\n  - ")}`;
    throw new PartialUploadError(message);
  }
  yield { type: "progress", message: `Uploaded ${uploadResult.fileCount} files` };

  const mode: "preview" | "production" = options.promote ? "production" : "preview";
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

  // `--promote` writes a new deploy AND repoints production to it, but
  // does NOT touch the preview alias — operators eyeballing the
  // preview URL after a promote-deploy can be surprised to see an
  // older build. Probe the preview alias and surface the divergence.
  // getAlias failure is non-fatal — the deploy itself succeeded.
  if (options.promote) {
    try {
      const preview = await client.getAlias({
        site: config.site,
        mode: "preview",
      });
      if (preview && preview.deployId !== finalizeResult.deployId) {
        yield {
          type: "warning",
          message: `Preview alias still points to ${preview.deployId}; it will not auto-update. Run \`universe static deploy\` (without --promote) to refresh preview.`,
        };
      }
    } catch (err) {
      // Surface credential-rotation errors loudly even though the
      // probe itself is best-effort; deploy already succeeded, so
      // the next `universe` call may fail with no obvious context
      // unless the operator sees this now. Transient network errors
      // (timeouts, DNS hiccups) stay swallowed.
      if (err instanceof ProxyError && (err.status === 401 || err.status === 403)) {
        yield {
          type: "warning",
          message: `Preview alias probe got ${err.status} (${err.code}) — token may need rotation: ${err.message}`,
        };
      }
    }
  }

  const sizeKB = (uploadResult.totalSize / 1024).toFixed(1);
  const nextLine =
    mode === "preview"
      ? `Next: universe static promote --from ${finalizeResult.deployId}`
      : "Promoted to production.\nPreview alias unchanged.";

  return {
    data: buildEnvelope("deploy", true, {
      deployId: finalizeResult.deployId,
      url: finalizeResult.url,
      mode: finalizeResult.mode,
      site: config.site,
      sha,
      fileCount: uploadResult.fileCount,
      totalSize: uploadResult.totalSize,
      identitySource: identity.source,
    }),
    format: [
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
  };
}

async function staticDeployHandler(
  options: StaticDeployHandlerOptions,
  deps: StaticDeployHandlerDeps = {},
): Promise<void> {
  const success = deps.logSuccess ?? ((s: string) => log.success(s));
  const error = deps.logError ?? ((s: string) => log.error(s));
  const exit = deps.exit ?? exitWithCode;

  const sdkOpts: StaticDeployOptions = {
    promote: options.promote,
    dir: options.dir,
  };

  try {
    let result: CommandResult;
    if (options.json) {
      result = await silentDrive(staticDeploy(sdkOpts, deps));
    } else {
      result = await clackDriver(staticDeploy(sdkOpts, deps));
    }

    if (options.json) {
      emitJson(result.data);
    } else {
      success(result.format);
    }
  } catch (err) {
    exit(outputError({ json: options.json, command: "deploy" }, err, { logError: error }));
  }
}

export { staticDeploy, staticDeployHandler };
export type {
  StaticDeployOptions,
  StaticDeploySdkDeps,
  StaticDeployHandlerOptions,
  StaticDeployHandlerDeps,
};
