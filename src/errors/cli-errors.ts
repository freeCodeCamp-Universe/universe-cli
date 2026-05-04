import {
  EXIT_BAD_ARGUMENTS,
  EXIT_CONFIG,
  EXIT_CONFIRM,
  EXIT_CREDENTIALS,
  EXIT_DEPLOYMENT,
  EXIT_GIT,
  EXIT_INVALID_MULTI_SELECT,
  EXIT_INVALID_NAME,
  EXIT_LAYER,
  EXIT_LIST,
  EXIT_LOGS,
  EXIT_MANIFEST,
  EXIT_PACKAGE_INSTALL,
  EXIT_PARTIAL,
  EXIT_PROMOTION,
  EXIT_REGISTRATION,
  EXIT_REPO_INITIALISATION,
  EXIT_ROLLBACK,
  EXIT_SCAFFOLD_WRITE,
  EXIT_STATUS,
  EXIT_STORAGE,
  EXIT_TARGET_EXISTS,
  EXIT_TEARDOWN,
  EXIT_UNSUPPORTED,
  EXIT_USAGE,
} from "./exit-codes.js";

class CliError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number) {
    super(message);
    this.exitCode = exitCode;
    this.name = "CliError";
  }
}

class InvalidNameError extends CliError {
  constructor(name: string) {
    super(
      `Invalid project name "${name}". Names must be lowercase kebab-case, start with a letter, and be 3–50 characters long.`,
      EXIT_INVALID_NAME,
    );
    this.name = "InvalidNameError";
  }
}

/**
 * Thrown when a CLI command receives invalid or excessive arguments.
 * Handlers should throw this error instead of returning an exit code for argument validation failures.
 */
class BadArgumentsError extends CliError {
  constructor(message: string) {
    super(message, EXIT_BAD_ARGUMENTS);
    this.name = "BadArgumentsError";
  }
}

class UsageError extends CliError {
  constructor(message: string) {
    super(message, EXIT_USAGE);
    this.name = "UsageError";
  }
}

class TargetDirectoryExistsError extends CliError {
  constructor(path: string) {
    super(
      `Target directory already exists: "${path}". Choose a different name or remove the existing directory.`,
      EXIT_TARGET_EXISTS,
    );
    this.name = "TargetDirectoryExistsError";
  }
}

class CreateUnsupportedRuntimeError extends CliError {
  constructor(runtime: string) {
    super(
      `Runtime "${runtime}" is not supported in this spike. Supported runtimes: Node.js (TypeScript), Static.`,
      EXIT_UNSUPPORTED,
    );
    this.name = "CreateUnsupportedRuntimeError";
  }
}

class CreateUnsupportedFrameworkError extends CliError {
  constructor(framework: string, runtime: string) {
    super(
      `Framework "${framework}" is not supported for runtime "${runtime}" in this spike.`,
      EXIT_UNSUPPORTED,
    );
    this.name = "CreateUnsupportedFrameworkError";
  }
}

/* This is for CreateInputValidationService to report invalid input */
class CreateUnsupportedCombinationError extends CliError {
  constructor(description: string) {
    super(`Unsupported combination in this spike: ${description}.`, EXIT_UNSUPPORTED);
    this.name = "CreateUnsupportedCombinationError";
  }
}

class InvalidMultiSelectError extends CliError {
  constructor(field: string) {
    super(
      `Invalid selection for "${field}": "None" cannot be combined with other selections.`,
      EXIT_INVALID_MULTI_SELECT,
    );
    this.name = "InvalidMultiSelectError";
  }
}

class MissingLayerError extends CliError {
  constructor(layerPath: string) {
    super(`Required template layer not found: "${layerPath}".`, EXIT_LAYER);
    this.name = "MissingLayerError";
  }
}

class LayerConflictError extends CliError {
  constructor(filePath: string, layerA: string, layerB: string) {
    super(
      `File path conflict: "${filePath}" exists in both "${layerA}" and "${layerB}". Non-configuration files cannot be merged.`,
      EXIT_LAYER,
    );
    this.name = "LayerConflictError";
  }
}

class ScaffoldWriteError extends CliError {
  constructor(path: string, cause: Error) {
    super(`Failed to write scaffold to "${path}": ${cause.message}`, EXIT_SCAFFOLD_WRITE);
    this.name = "ScaffoldWriteError";
    this.cause = cause;
  }
}

class ManifestNotFoundError extends CliError {
  constructor(path: string) {
    super(
      `Platform manifest not found at "${path}". Run "universe create" to scaffold a project first.`,
      EXIT_MANIFEST,
    );
    this.name = "ManifestNotFoundError";
  }
}

class ManifestInvalidError extends CliError {
  constructor(path: string, reason: string) {
    super(`Platform manifest at "${path}" is invalid: ${reason}`, EXIT_MANIFEST);
    this.name = "ManifestInvalidError";
  }
}

class RegistrationError extends CliError {
  constructor(name: string, reason: string) {
    super(`Failed to register project "${name}": ${reason}`, EXIT_REGISTRATION);
    this.name = "RegistrationError";
  }
}

class DeploymentError extends CliError {
  constructor(name: string, reason: string) {
    super(`Failed to deploy project "${name}": ${reason}`, EXIT_DEPLOYMENT);
    this.name = "DeploymentError";
  }
}

class LogsError extends CliError {
  constructor(name: string, reason: string) {
    super(`Failed to retrieve logs for project "${name}": ${reason}`, EXIT_LOGS);
    this.name = "LogsError";
  }
}

class PromotionError extends CliError {
  constructor(name: string, reason: string) {
    super(`Failed to promote project "${name}": ${reason}`, EXIT_PROMOTION);
    this.name = "PromotionError";
  }
}

class RollbackError extends CliError {
  constructor(name: string, reason: string) {
    super(`Failed to roll back project "${name}": ${reason}`, EXIT_ROLLBACK);
    this.name = "RollbackError";
  }
}

class StatusError extends CliError {
  constructor(name: string, reason: string) {
    super(`Failed to retrieve status for project "${name}": ${reason}`, EXIT_STATUS);
    this.name = "StatusError";
  }
}

class ListError extends CliError {
  constructor(name: string, reason: string) {
    super(`Failed to list deployments for project "${name}": ${reason}`, EXIT_LIST);
    this.name = "ListError";
  }
}

class TeardownError extends CliError {
  constructor(name: string, reason: string) {
    super(`Failed to tear down project "${name}": ${reason}`, EXIT_TEARDOWN);
    this.name = "TeardownError";
  }
}

class RepoInitialisationError extends CliError {
  constructor(reason: string) {
    super(`Repository initialisation failed: ${reason}`, EXIT_REPO_INITIALISATION);
    this.name = "RepoInitialisationError";
  }
}

class PackageInstallError extends CliError {
  constructor(reason: string) {
    super(`Package installation failed: ${reason}`, EXIT_PACKAGE_INSTALL);
    this.name = "PackageInstallError";
  }
}

// ── New error classes from other ─────────────────────────────────────────────

class ConfigError extends CliError {
  constructor(message: string) {
    super(message, EXIT_CONFIG);
    this.name = "ConfigError";
  }
}

class CredentialError extends CliError {
  constructor(message: string) {
    super(message, EXIT_CREDENTIALS);
    this.name = "CredentialError";
  }
}

class StorageError extends CliError {
  constructor(message: string) {
    super(message, EXIT_STORAGE);
    this.name = "StorageError";
  }
}

class GitError extends CliError {
  constructor(message: string) {
    super(message, EXIT_GIT);
    this.name = "GitError";
  }
}

class ConfirmError extends CliError {
  constructor(message: string) {
    super(message, EXIT_CONFIRM);
    this.name = "ConfirmError";
  }
}

class PartialUploadError extends CliError {
  constructor(message: string) {
    super(message, EXIT_PARTIAL);
    this.name = "PartialUploadError";
  }
}

export {
  BadArgumentsError,
  CliError,
  ConfigError,
  ConfirmError,
  CreateUnsupportedCombinationError,
  CreateUnsupportedFrameworkError,
  CreateUnsupportedRuntimeError,
  CredentialError,
  DeploymentError,
  GitError,
  InvalidMultiSelectError,
  InvalidNameError,
  LayerConflictError,
  ListError,
  LogsError,
  ManifestInvalidError,
  ManifestNotFoundError,
  MissingLayerError,
  PackageInstallError,
  PartialUploadError,
  PromotionError,
  RegistrationError,
  RepoInitialisationError,
  RollbackError,
  ScaffoldWriteError,
  StatusError,
  StorageError,
  TargetDirectoryExistsError,
  TeardownError,
  UsageError,
};
