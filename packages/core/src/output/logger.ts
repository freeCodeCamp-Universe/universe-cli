import { log } from "@clack/prompts";

function logError(message: string): void {
  log.error(message, { output: process.stderr });
}

function logSuccess(message: string): void {
  log.success(message);
}

export { logError, logSuccess };
