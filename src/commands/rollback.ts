import { loadConfig } from "../config/loader.js";
import { resolveWoodpeckerToken } from "../credentials/woodpecker.js";
import { WoodpeckerClient } from "../woodpecker/client.js";
import { WoodpeckerError } from "../woodpecker/errors.js";
import { streamFirstStepLogs } from "../woodpecker/stream.js";
import { type OutputContext, outputSuccess } from "../output/format.js";
import { PipelineError, UsageError } from "../errors.js";

const DEPLOY_ID_REGEX = /^\d{8}-\d{6}-(?:[a-f0-9]{7}|dirty-[a-f0-9]{8})$/;

export interface RollbackOptions {
  json: boolean;
  to?: string;
  follow?: boolean;
}

export async function rollback(options: RollbackOptions): Promise<void> {
  const config = loadConfig();
  const ctx: OutputContext = { json: options.json, command: "rollback" };

  if (!options.to) {
    throw new UsageError(
      "--to <deploy-id> is required. Find prior deploy IDs in the Woodpecker UI pipeline history.",
    );
  }
  if (!DEPLOY_ID_REGEX.test(options.to)) {
    throw new UsageError(
      `Invalid deploy ID format: ${options.to}. Expected YYYYMMDD-HHMMSS-<sha7> or YYYYMMDD-HHMMSS-dirty-<hex8>.`,
    );
  }

  const token = resolveWoodpeckerToken();
  const client = new WoodpeckerClient(config.woodpecker.endpoint, token);

  let pipeline;
  try {
    pipeline = await client.createPipeline(config.woodpecker.repo_id, {
      branch: "main",
      variables: { OP: "rollback", ROLLBACK_TO: options.to },
    });
  } catch (err) {
    if (err instanceof WoodpeckerError) {
      throw new PipelineError(
        `Failed to trigger rollback pipeline: ${err.message}`,
      );
    }
    throw err;
  }

  const humanMsg = `Rollback pipeline #${pipeline.number} started -> deploy ${options.to}`;

  outputSuccess(ctx, humanMsg, {
    pipelineNumber: pipeline.number,
    site: config.name,
    rollbackTo: options.to,
  });

  const shouldFollow = options.follow ?? process.stdout.isTTY === true;
  if (shouldFollow) {
    await streamFirstStepLogs(
      client,
      config.woodpecker.repo_id,
      pipeline.number,
    );
  }
}
