import {
  EXIT_CONFIG,
  EXIT_CREDENTIALS,
  EXIT_STORAGE,
  EXIT_OUTPUT_DIR,
  EXIT_GIT,
  EXIT_ALIAS,
  EXIT_DEPLOY_NOT_FOUND,
  EXIT_CONFIRM,
  EXIT_PIPELINE,
  EXIT_USAGE,
} from "./output/exit-codes.js";

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

export class OutputDirError extends CliError {
  readonly exitCode = EXIT_OUTPUT_DIR;
}

export class GitError extends CliError {
  readonly exitCode = EXIT_GIT;
}

export class AliasError extends CliError {
  readonly exitCode = EXIT_ALIAS;
}

export class DeployNotFoundError extends CliError {
  readonly exitCode = EXIT_DEPLOY_NOT_FOUND;
}

export class ConfirmError extends CliError {
  readonly exitCode = EXIT_CONFIRM;
}

export class PipelineError extends CliError {
  readonly exitCode = EXIT_PIPELINE;
}

export class UsageError extends CliError {
  readonly exitCode = EXIT_USAGE;
}
