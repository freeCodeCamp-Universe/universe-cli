import { loadConfig } from "../config/loader.js";
import { resolveWoodpeckerToken } from "../credentials/woodpecker.js";
import { getGitState } from "../deploy/git.js";
import { WoodpeckerClient } from "../woodpecker/client.js";
import { WoodpeckerError } from "../woodpecker/errors.js";
import { streamFirstStepLogs } from "../woodpecker/stream.js";
import { type OutputContext, outputSuccess } from "../output/format.js";
import { GitError, PipelineError } from "../errors.js";

export interface DeployOptions {
  json: boolean;
  branch?: string;
  follow?: boolean;
}

export async function deploy(options: DeployOptions): Promise<void> {
  const config = loadConfig();
  const ctx: OutputContext = { json: options.json, command: "deploy" };

  const token = resolveWoodpeckerToken();

  const git = getGitState();
  if (git.hash === null || git.branch === null) {
    throw new GitError("Not a git repository or no commits yet.");
  }
  if (git.dirty) {
    throw new GitError(
      "Git working tree is dirty — commit changes before deploying.",
    );
  }

  const client = new WoodpeckerClient(config.woodpecker.endpoint, token);
  const branch = options.branch ?? git.branch;

  let pipeline;
  try {
    pipeline = await client.createPipeline(config.woodpecker.repo_id, {
      branch,
      variables: { OP: "deploy", DEPLOY_TARGET: "preview" },
    });
  } catch (err) {
    if (err instanceof WoodpeckerError) {
      throw new PipelineError(
        `Failed to trigger deploy pipeline: ${err.message}`,
      );
    }
    throw err;
  }

  const previewUrl = `https://${config.domain.preview}`;
  const humanMsg = [
    `Deploy pipeline #${pipeline.number} started`,
    ``,
    `  Site:     ${config.name}`,
    `  Branch:   ${branch}`,
    `  Preview:  ${previewUrl}`,
  ].join("\n");

  outputSuccess(ctx, humanMsg, {
    pipelineNumber: pipeline.number,
    site: config.name,
    previewUrl,
    branch,
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
