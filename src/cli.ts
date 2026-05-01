import { CliError } from "./errors/cli-errors.js";
import type { ObservabilityClient } from "./observability/observability-client.port.js";
import type { HandlerResult } from "./commands/create/index.js";

const runCli = async (
  command: string,
  handler: () => Promise<HandlerResult>,
  observability: ObservabilityClient,
): Promise<{ exitCode: number }> => {
  observability.safeTrack(`${command}.start`);
  try {
    const result = await handler();
    if (result.exitCode === 0) {
      observability.safeTrack(`${command}.success`, result.meta);
    }
    return { exitCode: result.exitCode };
  } catch (error) {
    if (error instanceof CliError) {
      observability.safeError(error);
      observability.safeTrack(`${command}.failure`);
      process.stderr.write(`${error.stack ?? error.message}\n`);
      return { exitCode: error.exitCode };
    }
    throw error;
  }
};

export { runCli };
