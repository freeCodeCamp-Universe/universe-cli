import {
  EXIT_CONFIG,
  EXIT_CONFIRM,
  EXIT_CREDENTIALS,
  EXIT_GIT,
  EXIT_STORAGE,
} from "./output/exit-codes.js";

/**
 * Domain error hierarchy for the proxy-plane CLI.
 *
 * Each subclass binds to a stable EXIT_* code from `output/exit-codes`
 * so callers (cli.ts handler + per-command catches) can map exceptions
 * to process exit codes without `instanceof` ladders.
 *
 * Pre-pivot subclasses (`OutputDirError`, `AliasError`,
 * `DeployNotFoundError`) were tied to the v0.3 direct-S3 plane and
 * deleted with the storage modules. Their EXIT_* numeric codes remain
 * exported from `output/exit-codes` as stable contracts (per
 * `CLAUDE.md` non-obvious conventions).
 */

export abstract class CliError extends Error {
  abstract readonly exitCode: number;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ConfigError extends CliError {
  readonly exitCode = EXIT_CONFIG;
}

export class CredentialError extends CliError {
  readonly exitCode = EXIT_CREDENTIALS;
}

export class StorageError extends CliError {
  readonly exitCode = EXIT_STORAGE;
}

export class GitError extends CliError {
  readonly exitCode = EXIT_GIT;
}

export class ConfirmError extends CliError {
  readonly exitCode = EXIT_CONFIRM;
}
