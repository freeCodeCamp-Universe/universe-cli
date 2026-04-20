import type { WoodpeckerClient } from "./client.js";

export interface StreamWriter {
  write(chunk: string): boolean;
}

// v1: streams only the first pipeline step. Pipelines with multiple steps
// (build, upload, alias, …) surface only the first step's logs here; later
// step logs are available via the Woodpecker UI. See gxy-cassiopeia RFC §4.8.2.
export async function streamFirstStepLogs(
  client: WoodpeckerClient,
  repoId: number,
  pipelineNumber: number,
  out: StreamWriter = process.stdout,
): Promise<void> {
  for await (const line of client.streamLogs(repoId, pipelineNumber, 1)) {
    out.write(`${line.message}\n`);
  }
}
