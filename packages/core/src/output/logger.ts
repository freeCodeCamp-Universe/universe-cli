import { log } from "@clack/prompts";

interface Logger {
  error(msg: string): void;
  info(msg: string): void;
  success(msg: string): void;
  warn(msg: string): void;
}

const clackLogger: Logger = {
  error: (msg) => log.error(msg),
  info: (msg) => log.info(msg),
  success: (msg) => log.success(msg),
  warn: (msg) => log.warn(msg),
};

const silentLogger: Logger = {
  error: () => {},
  info: () => {},
  success: () => {},
  warn: () => {},
};

export { clackLogger, silentLogger };
export type { Logger };
