import {
  EXIT_CONFIG,
  EXIT_CONFIRM,
  EXIT_CREDENTIALS,
  EXIT_GIT,
  EXIT_PARTIAL,
  EXIT_STORAGE,
  EXIT_USAGE,
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

/**
 * Error envelope returned by artemis on non-2xx. `code` is the
 * machine-readable label from `internal/handler/*.go` (`bad_request`,
 * `verify_failed`, `site_unauthorized`, `user_unauthorized`,
 * `r2_put_failed`, etc.).
 */
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
    this.exitCode = mapExitCode(status);
    this.requestId = requestId;
    this.hint = hint;
  }

  withMessage(message: string): ProxyError {
    return new ProxyError(this.status, this.code, message, this.requestId, this.hint);
  }
}

export class SiteReservedError extends ProxyError {
  readonly reservedUntil?: string;

  constructor(message: string, reservedUntil?: string, requestId?: string, hint?: string) {
    super(409, "site_reserved", message, requestId, hint);
    this.reservedUntil = reservedUntil;
  }

  override withMessage(message: string): SiteReservedError {
    return new SiteReservedError(message, this.reservedUntil, this.requestId, this.hint);
  }
}

/**
 * Thrown when artemis returns 409 `alias_drift` — the server's
 * observed alias state differs from the caller's `expectedCurrent`
 * CAS guard. Carries the server's authoritative `current` value so
 * callers can offer a one-shot retry with a fresh expectedCurrent.
 *
 * Wire shape: `{error:{code:"alias_drift", message}, site, current}`.
 * Maps to EXIT_USAGE (operator error: stale state).
 */
class AliasDriftError extends ProxyError {
  readonly current: string;

  constructor(message: string, current: string, requestId?: string, hint?: string) {
    super(409, "alias_drift", message, requestId, hint);
    this.current = current;
  }

  override withMessage(message: string): AliasDriftError {
    return new AliasDriftError(message, this.current, this.requestId, this.hint);
  }
}

function mapExitCode(status: number): number {
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
