import { loadConfig } from "../config/loader.js";
import { resolveCredentials } from "../credentials/resolver.js";
import { createS3Client } from "../storage/client.js";
import { writeAlias } from "../storage/aliases.js";
import { listObjects } from "../storage/operations.js";
import { generateDeployId } from "../deploy/id.js";
import { getGitState } from "../deploy/git.js";
import { validateOutputDir } from "../deploy/preflight.js";
import { uploadDirectory } from "../deploy/upload.js";
import { writeDeployMetadata } from "../deploy/metadata.js";
import {
  type OutputContext,
  outputSuccess,
  outputError,
} from "../output/format.js";
import {
  EXIT_GIT,
  EXIT_OUTPUT_DIR,
  EXIT_PARTIAL,
  exitWithCode,
} from "../output/exit-codes.js";

const MAX_COLLISION_RETRIES = 3;
const COLLISION_DELAY_MS = 1000;

export interface DeployOptions {
  json: boolean;
  force?: boolean;
  outputDir?: string;
}

async function resolveDeployId(
  client: ReturnType<typeof createS3Client>,
  bucket: string,
  site: string,
  gitHash: string | undefined,
  force: boolean,
): Promise<string> {
  for (let attempt = 0; attempt < MAX_COLLISION_RETRIES; attempt++) {
    const deployId = generateDeployId(gitHash, force);
    const prefix = `${site}/deploys/${deployId}/`;
    const existing = await listObjects(client, { bucket, prefix });

    if (existing.length === 0) {
      return deployId;
    }

    if (attempt < MAX_COLLISION_RETRIES - 1) {
      await new Promise((resolve) => setTimeout(resolve, COLLISION_DELAY_MS));
    }
  }

  return generateDeployId(gitHash, force);
}

export async function deploy(options: DeployOptions): Promise<void> {
  const config = loadConfig({
    flags: options.outputDir ? { outputDir: options.outputDir } : undefined,
  });
  const credentials = resolveCredentials({
    remoteName: config.static.rclone_remote,
  });
  const client = createS3Client(credentials);

  const bucket = config.static.bucket;
  const site = config.name;
  const ctx: OutputContext = { json: options.json, command: "deploy" };

  const git = getGitState();

  if (git.hash === null && !options.force) {
    outputError(
      ctx,
      EXIT_GIT,
      "Git hash not available — use --force to deploy without git info",
    );
    exitWithCode(
      EXIT_GIT,
      "Git hash not available — use --force to deploy without git info",
    );
    return;
  }

  if (git.dirty) {
    console.warn(
      "Warning: git working tree is dirty — uncommitted changes will not be reflected in the deploy",
    );
  }

  const preflight = validateOutputDir(config.static.output_dir);
  if (!preflight.valid) {
    outputError(
      ctx,
      EXIT_OUTPUT_DIR,
      `Output directory invalid: ${preflight.error}`,
    );
    exitWithCode(
      EXIT_OUTPUT_DIR,
      `Output directory invalid: ${preflight.error}`,
    );
    return;
  }

  const gitHash = git.hash ?? undefined;
  const deployId = await resolveDeployId(
    client,
    bucket,
    site,
    gitHash,
    options.force ?? false,
  );

  const uploadResult = await uploadDirectory(
    client,
    bucket,
    site,
    deployId,
    config.static.output_dir,
  );

  if (uploadResult.errors.length > 0) {
    outputError(
      ctx,
      EXIT_PARTIAL,
      `Upload partially failed: ${uploadResult.errors.length} file(s) failed`,
      uploadResult.errors,
    );
    exitWithCode(
      EXIT_PARTIAL,
      `Upload partially failed: ${uploadResult.errors.length} file(s) failed`,
    );
    return;
  }

  await writeDeployMetadata(client, bucket, site, deployId, {
    deployId,
    timestamp: new Date().toISOString(),
    gitHash: git.hash,
    gitDirty: git.dirty,
    fileCount: uploadResult.fileCount,
    totalSize: uploadResult.totalSize,
  });

  await writeAlias(client, bucket, site, "preview", deployId);

  const sizeKB = (uploadResult.totalSize / 1024).toFixed(1);
  const previewDomain = config.domain?.preview ?? `preview.${site}`;
  const humanMsg = [
    `Deployed ${deployId}`,
    ``,
    `  Site:     ${site}`,
    `  Files:    ${uploadResult.fileCount}`,
    `  Size:     ${sizeKB} KB`,
    `  Alias:    preview`,
    `  Preview:  https://${previewDomain}`,
    ``,
    `Next: universe static promote`,
  ].join("\n");

  outputSuccess(ctx, humanMsg, {
    deployId,
    site,
    fileCount: uploadResult.fileCount,
    totalSize: uploadResult.totalSize,
    alias: "preview",
    previewDomain,
  });
}
