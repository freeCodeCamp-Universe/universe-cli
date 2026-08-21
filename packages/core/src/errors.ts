import {
  EXIT_CONFIG,
  EXIT_CONFIRM,
  EXIT_CREDENTIALS,
  EXIT_GIT,
  EXIT_PARTIAL,
  EXIT_STORAGE,
  EXIT_USAGE,
} from "./output/exit-codes.js";

abstract class CliError extends Error {
  abstract readonly exitCode: number;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

class ConfigError extends CliError {
  readonly exitCode = EXIT_CONFIG;
}

class ConfirmError extends CliError {
  readonly exitCode = EXIT_CONFIRM;
}

class CredentialError extends CliError {
  readonly exitCode = EXIT_CREDENTIALS;
}

class GitError extends CliError {
  readonly exitCode = EXIT_GIT;
}

class PartialUploadError extends CliError {
  readonly exitCode = EXIT_PARTIAL;
}

class StorageError extends CliError {
  readonly exitCode = EXIT_STORAGE;
}

class UsageError extends CliError {
  readonly exitCode = EXIT_USAGE;
}

class ProxyError extends CliError {
  readonly exitCode: number;
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly hint?: string;

  constructor(status: number, code: string, message: string, requestId?: string, hint?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.exitCode = mapProxyExitCode(status);
    this.requestId = requestId;
    this.hint = hint;
  }
}

class AliasDriftError extends ProxyError {
  readonly current: string;

  constructor(message: string, current: string) {
    super(409, "alias_drift", message);
    this.current = current;
  }
}

function mapProxyExitCode(status: number): number {
  if (status === 401 || status === 403) return EXIT_CREDENTIALS;
  if (status === 429 || status === 422 || status === 0 || status >= 500) return EXIT_STORAGE;
  return EXIT_USAGE;
}

export {
  AliasDriftError,
  CliError,
  ConfigError,
  ConfirmError,
  CredentialError,
  GitError,
  PartialUploadError,
  ProxyError,
  StorageError,
  UsageError,
};
