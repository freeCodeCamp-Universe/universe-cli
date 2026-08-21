import { log } from "@clack/prompts";

interface Logger {
  error(message: string): void;
  info(message: string): void;
  success(message: string): void;
  warn(message: string): void;
}

const clackLogger: Logger = {
  error: (message) => log.error(message),
  info: (message) => log.info(message),
  success: (message) => log.success(message),
  warn: (message) => log.warn(message),
};
const silentLogger: Logger = {
  error: () => {},
  info: () => {},
  success: () => {},
  warn: () => {},
};

function logError(message: string): void {
  log.error(message, { output: process.stderr });
}

function logSuccess(message: string): void {
  log.success(message);
}

export { clackLogger, logError, logSuccess, silentLogger };
export type { Logger };
