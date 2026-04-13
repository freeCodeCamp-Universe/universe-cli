import { confirm } from "@clack/prompts";
import { loadConfig } from "../config/loader.js";
import { resolveCredentials } from "../credentials/resolver.js";
import { createS3Client } from "../storage/client.js";
import { readAlias, writeAlias } from "../storage/aliases.js";
import { listDeploys } from "../storage/deploys.js";
import {
  type OutputContext,
  outputSuccess,
  outputError,
} from "../output/format.js";
import {
  EXIT_ALIAS,
  EXIT_CONFIRM,
  exitWithCode,
} from "../output/exit-codes.js";

export interface RollbackOptions {
  json: boolean;
  confirm: boolean;
}

export async function rollback(options: RollbackOptions): Promise<void> {
  const config = loadConfig();
  const credentials = resolveCredentials({
    remoteName: config.static.rclone_remote,
  });
  const client = createS3Client(credentials);

  const bucket = config.static.bucket;
  const site = config.name;
  const ctx: OutputContext = { json: options.json, command: "rollback" };

  const currentDeployId = await readAlias(client, bucket, site, "production");
  if (!currentDeployId) {
    outputError(
      ctx,
      EXIT_ALIAS,
      "No production alias set — nothing to rollback",
    );
    exitWithCode(EXIT_ALIAS, "No production alias set — nothing to rollback");
    return;
  }

  const deploys = await listDeploys(client, bucket, site);
  const currentIndex = deploys.indexOf(currentDeployId);
  const previousDeploy = deploys[currentIndex + 1];

  if (!previousDeploy) {
    outputError(ctx, EXIT_ALIAS, "no previous deploy to rollback to");
    exitWithCode(EXIT_ALIAS, "no previous deploy to rollback to");
    return;
  }

  if (options.json && !options.confirm) {
    outputError(
      ctx,
      EXIT_CONFIRM,
      "Rollback requires --confirm flag in JSON mode",
    );
    exitWithCode(EXIT_CONFIRM, "Rollback requires --confirm flag in JSON mode");
    return;
  }

  if (!options.json && !options.confirm) {
    const confirmed = await confirm({
      message: `Rollback production from ${currentDeployId} to ${previousDeploy}?`,
    });
    if (!confirmed || typeof confirmed === "symbol") {
      return;
    }
  }

  // v1 limitation: concurrent alias writes have last-write-wins behavior.
  // S3 PutObject is atomic for single writes but concurrent writes have undefined ordering.
  await writeAlias(client, bucket, site, "production", previousDeploy);

  outputSuccess(ctx, `Rolled back production to ${previousDeploy}`, {
    previousDeployId: currentDeployId,
    rolledBackTo: previousDeploy,
    site,
    alias: "production",
  });
}
