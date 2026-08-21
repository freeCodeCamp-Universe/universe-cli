import { log } from "@clack/prompts";
import {
  clackDriver,
  create,
  emitJson,
  exitWithCode,
  outputError,
  silentDrive,
} from "@freecodecamp/universe-create";
import type { CommandResult, CreateDeps, CreateOptions } from "@freecodecamp/universe-create";

interface CreateHandlerOptions {
  json: boolean;
  forceFetch?: boolean;
  yes?: boolean;
  name?: string;
  runtime?: string;
  framework?: string;
  databases?: string[];
  services?: string[];
  packageManager?: string;
}

interface CreateHandlerDeps extends CreateDeps {
  isTTY?: boolean;
  logError?: (msg: string) => void;
  exit?: (code: number) => void;
}

async function createHandler(
  options: CreateHandlerOptions,
  deps: CreateHandlerDeps = {},
): Promise<void> {
  const error = deps.logError ?? ((message: string) => log.error(message));
  const exit = deps.exit ?? exitWithCode;
  const isTTY = deps.isTTY ?? Boolean(process.stdin.isTTY);
  const interactive = isTTY && !options.yes && !options.json;

  const sdkOptions: CreateOptions = {
    forceFetch: options.forceFetch,
    name: options.name,
    runtime: options.runtime,
    framework: options.framework,
    databases: options.databases,
    services: options.services,
    packageManager: options.packageManager,
    yes: !interactive,
  };

  let result: CommandResult;
  try {
    result = interactive
      ? await clackDriver(create(sdkOptions, deps))
      : await silentDrive(create(sdkOptions, deps));
  } catch (error_) {
    exit(outputError({ json: options.json, command: "create" }, error_, { logError: error }));
    return;
  }

  if (options.json) {
    emitJson(result.data);
  } else {
    log.success(result.format);
  }
}

export { createHandler };
export type { CreateHandlerDeps, CreateHandlerOptions };
