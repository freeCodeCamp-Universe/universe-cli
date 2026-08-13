// SDK entrypoint — public API for programmatic consumers.

// Types
export type { CommandResult } from "./output/command-result.js";
export type { Envelope } from "./output/envelope.js";
export type {
  Step,
  StepResponse,
  TextStep,
  SelectStep,
  MultiselectStep,
  ConfirmStep,
  ProgressStep,
  WarningStep,
  InfoStep,
  CommandGenerator,
} from "./interaction/step.js";

// Interaction driver
export { clackDriver, drive } from "./interaction/clack-driver.js";
export { silentDrive } from "./interaction/silent-driver.js";
export type { StepHandler } from "./interaction/clack-driver.js";

// Commands
export { create } from "./commands/create/index.js";
export type { CreateOptions, CreateDeps } from "./commands/create/index.js";

// Error classes
export {
  CliError,
  ConfigError,
  CredentialError,
  StorageError,
  GitError,
  ConfirmError,
  PartialUploadError,
  UsageError,
} from "./errors.js";
export { ProxyError, AliasDriftError } from "./lib/proxy-client.js";
