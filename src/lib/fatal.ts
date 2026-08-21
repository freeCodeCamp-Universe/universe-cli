import { EXIT_USAGE } from "@freecodecamp/universe-core";
import { redact } from "@freecodecamp/universe-core";

export function formatFatal(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return `universe: ${redact(message)}`;
}

function defaultOnFatal(err: unknown): never {
  process.stderr.write(formatFatal(err) + "\n");
  process.exit(EXIT_USAGE);
}

export function installFatalHandlers(onFatal: (err: unknown) => void = defaultOnFatal): void {
  process.on("unhandledRejection", onFatal);
  process.on("uncaughtException", onFatal);
}
