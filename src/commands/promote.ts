import { loadConfig } from "../config/loader.js";
import { resolveCredentials } from "../credentials/resolver.js";
import { createS3Client } from "../storage/client.js";
import { readAlias, writeAlias } from "../storage/aliases.js";
import { deployExists } from "../storage/deploys.js";
import {
  type OutputContext,
  outputSuccess,
  outputError,
} from "../output/format.js";
import {
  EXIT_ALIAS,
  EXIT_DEPLOY_NOT_FOUND,
  exitWithCode,
} from "../output/exit-codes.js";

export interface PromoteOptions {
  json: boolean;
  deployId?: string;
}

export async function promote(options: PromoteOptions): Promise<void> {
  const config = loadConfig();
  const credentials = resolveCredentials({
    remoteName: config.static.rclone_remote,
  });
  const client = createS3Client(credentials);

  const bucket = config.static.bucket;
  const site = config.name;
  const ctx: OutputContext = { json: options.json, command: "promote" };

  let deployId: string;

  if (options.deployId) {
    const exists = await deployExists(client, bucket, site, options.deployId);
    if (!exists) {
      outputError(
        ctx,
        EXIT_DEPLOY_NOT_FOUND,
        `Deploy ${options.deployId} not found`,
      );
      exitWithCode(
        EXIT_DEPLOY_NOT_FOUND,
        `Deploy ${options.deployId} not found`,
      );
      return;
    }
    deployId = options.deployId;
  } else {
    const preview = await readAlias(client, bucket, site, "preview");
    if (!preview) {
      outputError(
        ctx,
        EXIT_ALIAS,
        "No preview alias set — deploy first or specify a deploy ID",
      );
      exitWithCode(
        EXIT_ALIAS,
        "No preview alias set — deploy first or specify a deploy ID",
      );
      return;
    }
    deployId = preview;
  }

  // v1 limitation: concurrent alias writes have last-write-wins behavior.
  // S3 PutObject is atomic for single writes but concurrent writes have undefined ordering.
  await writeAlias(client, bucket, site, "production", deployId);

  outputSuccess(ctx, `Promoted ${deployId} to production`, {
    deployId,
    site,
    alias: "production",
  });
}
