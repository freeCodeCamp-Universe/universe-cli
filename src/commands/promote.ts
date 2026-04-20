import { loadConfig } from "../config/loader.js";
import { resolveWoodpeckerToken } from "../credentials/woodpecker.js";
import { getGitState } from "../deploy/git.js";
import { WoodpeckerClient } from "../woodpecker/client.js";
import { WoodpeckerError } from "../woodpecker/errors.js";
import { streamFirstStepLogs } from "../woodpecker/stream.js";
import { type OutputContext, outputSuccess } from "../output/format.js";
import { PipelineError } from "../errors.js";

export interface PromoteOptions {
  json: boolean;
  follow?: boolean;
}

export async function promote(options: PromoteOptions): Promise<void> {
  const config = loadConfig();
  const ctx: OutputContext = { json: options.json, command: "promote" };

  const token = resolveWoodpeckerToken();
  const git = getGitState();
  const client = new WoodpeckerClient(config.woodpecker.endpoint, token);
  const branch = git.branch ?? "main";

  let pipeline;
  try {
    pipeline = await client.createPipeline(config.woodpecker.repo_id, {
      branch,
      variables: { OP: "promote" },
    });
  } catch (err) {
    if (err instanceof WoodpeckerError) {
      throw new PipelineError(
        `Failed to trigger promote pipeline: ${err.message}`,
      );
    }
    throw err;
  }

  const productionUrl = `https://${config.domain.production}`;
  const humanMsg = [
    `Promote pipeline #${pipeline.number} started`,
    ``,
    `  Site:        ${config.name}`,
    `  Production:  ${productionUrl}`,
  ].join("\n");

  outputSuccess(ctx, humanMsg, {
    pipelineNumber: pipeline.number,
    site: config.name,
    productionUrl,
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
