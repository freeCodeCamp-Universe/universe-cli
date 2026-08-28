import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { log, spinner } from "@clack/prompts";
import {
  CliError,
  ConfigError,
  CredentialError,
  GitError,
  PartialUploadError,
  StorageError,
} from "../errors.js";
import { getGitState as defaultGetGitState, type GitState } from "../deploy/git.js";
import { deployIdSha, stampSha } from "../deploy/stamp.js";
import { hasRootIndex, missingRootIndexMessage } from "../deploy/index-check.js";
import { walkFiles as defaultWalkFiles } from "../deploy/walk.js";
import { runBuild as defaultRunBuild } from "../lib/build.js";
import { DEFAULT_PROXY_URL } from "../lib/constants.js";
import { resolveIdentity as defaultResolveIdentity } from "../lib/identity.js";
import { createIgnoreFilter } from "../lib/ignore.js";
import { parsePlatformYaml, type PlatformYamlV2 } from "../lib/platform-yaml.js";
import { suggest } from "../lib/similarity.js";
import {
  createProxyClient as defaultCreateProxyClient,
  heldFilterUnanswered,
  parseFetchTimeoutMs,
  ProxyError,
  SiteReservedError,
  wrapProxyError,
  type ProxyClient,
  type ProxyClientConfig,
  type SiteRow,
} from "../lib/proxy-client.js";
import { uploadFiles as defaultUploadFiles } from "../lib/upload.js";
import { buildEnvelope } from "../output/envelope.js";
import { EXIT_USAGE, exitWithCode } from "../output/exit-codes.js";
import { emitJson, outputError } from "../output/format.js";

export interface DeployOptions {
  json: boolean;
  promote?: boolean;
  /** Override `build.output` from platform.yaml (matches `--dir` flag). */
  dir?: string;
  noReuse?: boolean;
  allowDirty?: boolean;
}

/**
 * Minimal subset of `@clack/prompts` `SpinnerResult` the deploy command
 * relies on. Kept narrow so unit tests can inject a vi.fn() quad without
 * stubbing the full clack surface.
 */
export interface SpinnerLike {
  start(msg?: string): void;
  message(msg?: string): void;
  stop(msg?: string): void;
  error(msg?: string): void;
}

export interface DeployDeps {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  readPlatformYaml?: (cwd: string) => Promise<string>;
  resolveIdentity?: typeof defaultResolveIdentity;
  createProxyClient?: (cfg: ProxyClientConfig) => ProxyClient;
  getGitState?: (cwd: string) => GitState;
  runBuild?: typeof defaultRunBuild;
  walkFiles?: typeof defaultWalkFiles;
  uploadFiles?: typeof defaultUploadFiles;
  createSpinner?: () => SpinnerLike;
  logSuccess?: (msg: string) => void;
  logInfo?: (msg: string) => void;
  logWarn?: (msg: string) => void;
  logError?: (msg: string) => void;
  exit?: (code: number) => never;
}

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
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new ConfigError(`platform.yaml not found in ${cwd}. See docs/platform-yaml.md.`);
    }
    throw err;
  }
  const r = parsePlatformYaml(raw);
  if (!r.ok) throw new ConfigError(r.error);
  return r.value;
}

type HoldProbe = { kind: "held"; row: SiteRow } | { kind: "free" } | { kind: "unknown" };

async function heldReservation(client: ProxyClient, site: string): Promise<HoldProbe> {
  let rows: SiteRow[];
  try {
    rows = await client.listSites({ state: "reserved" });
  } catch {
    return { kind: "unknown" };
  }
  if (heldFilterUnanswered(rows)) return { kind: "unknown" };
  const row = rows.find((r) => r.slug === site);
  return row ? { kind: "held", row } : { kind: "free" };
}

function rethrowProxy(prefix: string, err: unknown): never {
  if (err instanceof ProxyError) {
    throw err.withMessage(`${prefix}: ${err.message}`);
  }
  if (err instanceof Error) throw new StorageError(`${prefix}: ${err.message}`);
  throw new StorageError(`${prefix}: ${String(err)}`);
}

/**
 * Cap on how many authorized slugs to render inline in the preflight
 * error body. Above this, the message shows the count + a one-line
 * `sites list --mine` redirect — staff in broad teams (e.g. `staff` on
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
 *     otherwise count + `universe sites list --mine` redirect.
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
      `  Run \`universe sites list --mine\` to inspect the full list.`,
    );
  }

  return lines.join("\n");
}

export async function deploy(options: DeployOptions, deps: DeployDeps = {}): Promise<void> {
  const cwd = deps.cwd ?? process.cwd();
  const env = deps.env ?? process.env;
  const readYaml = deps.readPlatformYaml ?? defaultReadPlatformYaml;
  const resolveId = deps.resolveIdentity ?? defaultResolveIdentity;
  const mkClient = deps.createProxyClient ?? defaultCreateProxyClient;
  const gitState = deps.getGitState ?? defaultGetGitState;
  const build = deps.runBuild ?? defaultRunBuild;
  const walk = deps.walkFiles ?? defaultWalkFiles;
  const upload = deps.uploadFiles ?? defaultUploadFiles;
  const mkSpinner = deps.createSpinner ?? (() => spinner() as SpinnerLike);
  const success = deps.logSuccess ?? ((s: string) => log.success(s));
  const info = deps.logInfo ?? ((s: string) => log.info(s));
  const warn = deps.logWarn ?? ((s: string) => log.warn(s));
  const error = deps.logError ?? ((s: string) => log.error(s));
  const exit = deps.exit ?? exitWithCode;

  try {
    if (options.dir !== undefined && options.dir.trim() === "") {
      throw new ConfigError("--dir needs a path; an empty value would publish the repository root");
    }

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
      const probe = await heldReservation(client, config.site);
      if (probe.kind === "held") {
        throw new SiteReservedError(
          `${config.site} was deleted and its name is held, so it cannot be deployed to.`,
          probe.row.reservedUntil,
        );
      }
      const unresolved =
        probe.kind === "unknown"
          ? "\n  note: this artemis did not answer the held-name filter, so a recent delete cannot be ruled out. Run `universe sites list --held`."
          : "";
      throw new CredentialError(
        formatUnauthorizedSiteError({
          attempted: config.site,
          login: me.login,
          authorized: me.authorizedSites,
        }) + unresolved,
      );
    }

    const git = gitState(cwd);
    const { sha, source: shaSource } = stampSha(git, options.dir !== undefined);
    const provenance = shaSource === "head" || git.hash === null ? {} : { headSha: git.hash };
    if (shaSource === "dirty" && !options.allowDirty) {
      throw new GitError(
        "git working tree is dirty — refusing to deploy uncommitted files. Commit them, or pass --allow-dirty to deploy anyway.",
      );
    }
    if (shaSource === "dirover" && !options.allowDirty) {
      throw new GitError(
        "--dir replaces build.output, so the upload cannot be traced to HEAD. Pass --allow-dirty to deploy it anyway.",
      );
    }
    if (git.dirty && !options.json) {
      warn(`git working tree is dirty — this deploy is stamped ${sha}, not the HEAD commit.`);
    }
    if (shaSource === "dirover" && !options.json) {
      warn(`--dir replaced build.output — this deploy is stamped ${sha}, not the HEAD commit.`);
    }

    if (
      options.promote &&
      !git.dirty &&
      git.hash &&
      options.dir === undefined &&
      !options.noReuse
    ) {
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
        if (options.json) {
          emitJson(
            buildEnvelope("deploy", true, {
              deployId: promoted.deployId,
              url: promoted.url,
              mode: "production",
              site: config.site,
              sha,
              shaSource,
              fileCount: 0,
              totalSize: 0,
              reusedPreview: true,
              identitySource: identity.source,
            }),
          );
        } else {
          success(
            [
              `Promoted existing preview ${promoted.deployId} to production`,
              ``,
              `  Site:        ${config.site}`,
              `  Deploy:      ${promoted.deployId}`,
              `  Production:  ${promoted.url}`,
              ``,
              `Preview was already at this commit (${previewSha}); skipped rebuild and re-upload.`,
            ].join("\n"),
          );
        }
        return;
      }
    }

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

    // Spinner is created only in non-JSON mode so machine consumers
    // see a single JSON envelope on stdout. onProgress passes the
    // per-file callback through to `uploadFiles` — multi-MB /
    // multi-hundred-file sites previously uploaded silently.
    const spin = options.json ? null : mkSpinner();
    spin?.start(`Uploading 0/${filtered.length} files`);
    const uploadResult = await upload({
      client,
      deployId: initResult.deployId,
      jwt: initResult.jwt,
      files: filtered,
      onProgress: spin
        ? (p) => spin.message(`Uploading ${p.uploaded}/${p.total} — ${p.current}`)
        : undefined,
    });
    if (uploadResult.errors.length > 0) {
      spin?.error(`Upload failed: ${uploadResult.errors.length} file(s)`);
      const message = `Upload partially failed: ${uploadResult.errors.length} file(s) failed:\n  - ${uploadResult.errors.join("\n  - ")}`;
      // EXIT_PARTIAL is dedicated; throw a CliError that maps to it.
      throw new PartialUploadError(message);
    }
    spin?.stop(`Uploaded ${uploadResult.fileCount} files`);

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
    // JSON mode skips: machine consumers parse `mode` themselves and the
    // single-envelope contract excludes side-band warns. getAlias
    // failure is non-fatal — the deploy itself succeeded.
    if (options.promote && !options.json) {
      try {
        const preview = await client.getAlias({
          site: config.site,
          mode: "preview",
        });
        if (preview && preview.deployId !== finalizeResult.deployId) {
          warn(
            `Preview alias still points to ${preview.deployId}; it will not auto-update. Run \`universe static deploy\` (without --promote) to refresh preview.`,
          );
        }
      } catch (err) {
        // Surface credential-rotation errors loudly even though the
        // probe itself is best-effort; deploy already succeeded, so
        // the next `universe` call may fail with no obvious context
        // unless the operator sees this now. Transient network errors
        // (timeouts, DNS hiccups) stay swallowed.
        if (err instanceof ProxyError && (err.status === 401 || err.status === 403)) {
          warn(
            `Preview alias probe got ${err.status} (${err.code}) — token may need rotation: ${err.message}`,
          );
        }
      }
    }

    if (options.json) {
      emitJson(
        buildEnvelope("deploy", true, {
          deployId: finalizeResult.deployId,
          url: finalizeResult.url,
          mode: finalizeResult.mode,
          site: config.site,
          sha,
          shaSource,
          ...provenance,
          reusedPreview: false,
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
          : "Promoted to production.\nPreview alias unchanged.";
      success(
        [
          `Deployed ${finalizeResult.deployId}`,
          ``,
          `  Site:     ${config.site}`,
          `  Files:    ${uploadResult.fileCount}`,
          `  Size:     ${sizeKB} KB`,
          `  Mode:     ${mode}`,
          ...(git.hash !== null && shaSource !== "head"
            ? [`  Commit:   ${git.hash} (stamped ${shaSource})`]
            : []),
          `  URL:      ${finalizeResult.url}`,
          ``,
          nextLine,
        ].join("\n"),
      );
    }
  } catch (err) {
    let code: number;
    let message: string;
    let kind: string | undefined;
    let requestId: string | undefined;
    if (err instanceof ProxyError) {
      ({ code, message, kind, requestId } = wrapProxyError("deploy", err));
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
    outputError({ json: options.json, command: "deploy" }, code, message, {
      logError: error,
      kind,
      requestId,
    });
    exit(code);
  }
}
