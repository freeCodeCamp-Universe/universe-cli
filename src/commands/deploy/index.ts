import { readFile as nodeReadFile } from "node:fs/promises";
import { join } from "node:path";
import type { IdentityResolver } from "../../auth/identity-resolver.port.js";
import {
  ConfigError,
  CredentialError,
  GitError,
  PartialUploadError,
} from "../../errors/cli-errors.js";
import type { Logger } from "../../output/logger.js";
import { writeJson } from "../../output/write-json.js";
import { parsePlatformYaml } from "../../platform/platform-yaml-v2.js";
import type { ProxyClient } from "../../platform/proxy-client.port.js";
import type { HandlerResult } from "../create/index.js";
import type { RunBuildOptions, RunBuildResult } from "./build.js";
import { runBuild as defaultRunBuild } from "./build.js";
import type { GitState } from "./git.js";
import { getGitState as defaultGetGitState } from "./git.js";
import { createIgnoreFilter } from "./ignore.js";
import type { UploadFilesOptions, UploadFilesResult } from "./upload.js";
import { uploadFiles as defaultUploadFiles } from "./upload.js";
import type { WalkedFile } from "./walk.js";
import { walkFiles as defaultWalkFiles } from "./walk.js";

interface DeployOptions {
  cwd: string;
  dir?: string;
  json: boolean;
  promote?: boolean;
}

interface DeployDeps {
  getGitState?: () => GitState;
  identityResolver: IdentityResolver;
  logger: Logger;
  proxyClient: ProxyClient;
  readFile?: (path: string) => Promise<string>;
  runBuild?: (options: RunBuildOptions) => Promise<RunBuildResult>;
  uploadFiles?: (options: UploadFilesOptions) => Promise<UploadFilesResult>;
  walkFiles?: (dir: string) => WalkedFile[];
}

const defaultReadFileFn = (path: string): Promise<string> => nodeReadFile(path, "utf-8");

const handleDeploy = async (opts: DeployOptions, deps: DeployDeps): Promise<HandlerResult> => {
  const { logger } = deps;
  const read = deps.readFile ?? defaultReadFileFn;
  const git = deps.getGitState ?? defaultGetGitState;
  const build = deps.runBuild ?? defaultRunBuild;
  const walk = deps.walkFiles ?? defaultWalkFiles;
  const upload = deps.uploadFiles ?? defaultUploadFiles;

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
      `platform.yaml not found in ${process.cwd()}. See docs/platform-yaml.md.`,
    );
  }

  const parseResult = parsePlatformYaml(rawYaml);
  if (!parseResult.ok) {
    throw new ConfigError(parseResult.error);
  }
  const config = parseResult.value;

  // 3. Verify site authorization
  const me = await deps.proxyClient.whoami();
  if (!me.authorizedSites.includes(config.site)) {
    const sitesLine =
      me.authorizedSites.length > 0 ? me.authorizedSites.join(", ") : "(no sites authorized)";
    throw new CredentialError(
      [
        `Site '${config.site}' is not registered for your GitHub identity.`,
        ``,
        `  You are:           ${me.login}`,
        `  Authorized sites:  ${sitesLine}`,
        ``,
        `Likely causes (most common first):`,
        `  1. Platform admin has not added '${config.site}' to artemis`,
        `     'config/sites.yaml' yet (one-time, per site).`,
        `  2. You are not in any GitHub team listed for '${config.site}'.`,
        ``,
        `Runbook:`,
        `  https://github.com/freeCodeCamp/infra/blob/main/docs/runbooks/01-deploy-new-constellation-site.md`,
      ].join("\n"),
    );
  }

  // 4. Check git state
  const gitState = git();
  if (gitState.dirty) {
    logger.warn("git working tree is dirty — uncommitted changes will not be reflected.");
  }

  // 5. Build
  const buildResult = await build({
    command: config.build.command,
    cwd: opts.cwd,
    outputDir: opts.dir ?? config.build.output,
  });
  if (buildResult.skipped) {
    logger.info("build.command not set — using pre-built output.");
  }

  // 6. Walk and filter files
  const allFiles = walk(buildResult.outputDir);
  const shouldIgnore = createIgnoreFilter(config.deploy.ignore);
  const files = allFiles.filter((f) => !shouldIgnore(f.relPath));
  if (files.length === 0) {
    throw new GitError(`No files to deploy under ${buildResult.outputDir}.`);
  }

  // 7. Initialise deploy session
  const sha = gitState.hash ?? `nogit-${Date.now().toString(36)}`;
  const { deployId, jwt } = await deps.proxyClient.deployInit({
    files: files.map((f) => f.relPath),
    sha,
    site: config.site,
  });

  // 8. Upload files
  const uploadResult = await upload({
    client: deps.proxyClient,
    deployId,
    files,
    jwt,
  });
  if (uploadResult.errors.length > 0) {
    throw new PartialUploadError(
      `Upload partially failed: ${uploadResult.errors.length} file(s) failed:\n  - ${uploadResult.errors.join("\n  - ")}`,
    );
  }

  // 9. Finalise deploy
  const mode = opts.promote ? "production" : "preview";

  const finalizeResult = await deps.proxyClient.deployFinalize({
    deployId,
    files: files.map((f) => f.relPath),
    jwt,
    mode: mode,
  });

  // 10. Emit output
  const summary = {
    deployId: finalizeResult.deployId,
    fileCount: uploadResult.fileCount,
    identitySource: identity.source,
    mode: finalizeResult.mode,
    sha,
    site: config.site,
    totalSize: uploadResult.totalSize,
    url: finalizeResult.url,
  };

  if (opts.json) {
    writeJson("static deploy", true, summary);
  } else {
    const sizeKB = (uploadResult.totalSize / 1024).toFixed(1);
    const nextLine =
      mode === "preview" ? "Next: universe static promote" : "Promoted to production.";
    logger.success(
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

  return { exitCode: 0 };
};

export { handleDeploy, type DeployDeps, type DeployOptions };
