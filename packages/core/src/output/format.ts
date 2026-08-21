import { CliError, ProxyError } from "../errors.js";
import { buildEnvelope, buildErrorEnvelope } from "./envelope.js";
import { EXIT_USAGE } from "./exit-codes.js";
import { logError, logSuccess } from "./logger.js";
import { redact, redactObject } from "./redact.js";

interface OutputContext {
  json: boolean;
  command: string;
}

/**
 * Options passed as 4th positional to `outputError`. The 4th arg also
 * still accepts a bare `string[]` issues array for back-compat with the
 * pre-T28 signature.
 */
interface OutputErrorOptions {
  /** Sub-errors / hints rendered into envelope.error.issues. */
  issues?: string[];
  /**
   * Extra top-level keys spliced into the JSON envelope. Used by
   * promote/rollback drift to carry `current` so scripted callers can
   * re-pin expectedCurrent on retry without re-querying the alias.
   */
  extras?: Record<string, unknown>;
  /**
   * Dep-injected logger for the non-JSON branch. Defaults to clack
   * `log.error`. Commands pass their dep's logError so unit tests can
   * spy without monkey-patching the clack module.
   */
  logError?: (msg: string) => void;
  kind?: string;
  requestId?: string;
}

function emitJson(envelope: object): void {
  process.stdout.write(`${JSON.stringify(envelope)}\n`);
}

function outputSuccess(
  context: OutputContext,
  humanMessage: string,
  data: Record<string, unknown>,
): void {
  if (context.json) emitJson(buildEnvelope(context.command, true, data));
  else logSuccess(humanMessage);
}

/**
 * Format a proxy or generic error into a normalized envelope.
 *
 *   ProxyError → `<cmd> failed (<code>): <message>` + hint
 *   CliError   → preserve message verbatim
 *   Error      → preserve message verbatim
 *   other      → String(err)
 */
function outputError(
  context: OutputContext,
  exitCode: number,
  message: string,
  optionsOrIssues?: OutputErrorOptions | string[],
): number;
function outputError(context: OutputContext, error: unknown, options?: OutputErrorOptions): number;
function outputError(
  context: OutputContext,
  exitCodeOrError: number | unknown,
  messageOrOptions?: string | OutputErrorOptions | string[],
  maybeOptions?: OutputErrorOptions | string[],
): number {
  if (typeof exitCodeOrError === "number") {
    return renderError(context, exitCodeOrError, messageOrOptions as string, maybeOptions);
  }
  const parsed = parseError(context.command, exitCodeOrError);
  const options = (messageOrOptions ?? {}) as OutputErrorOptions;
  return renderError(context, parsed.exitCode, parsed.message, {
    ...options,
    kind: options.kind ?? parsed.kind,
    requestId: options.requestId ?? parsed.requestId,
  });
}

function renderError(
  context: OutputContext,
  exitCode: number,
  message: string,
  optionsOrIssues?: OutputErrorOptions | string[],
): number {
  const options = Array.isArray(optionsOrIssues)
    ? { issues: optionsOrIssues }
    : (optionsOrIssues ?? {});
  const redactedMessage = redact(message);
  const redactedIssues = options.issues?.map(redact);

  if (context.json) {
    const envelope = buildErrorEnvelope(
      context.command,
      exitCode,
      redactedMessage,
      redactedIssues,
      options.kind,
      options.requestId,
    );
    // opts.extras passes through redactObject so a future caller who
    // stuffs a token / credential into the extras map doesn't leak it.
    // Today's only callers (promote / rollback drift) pass `{ current:
    // <deployId> }`; redact() is a no-op on a deploy id, so the
    // observable behaviour is unchanged.
    emitJson(options.extras ? { ...envelope, ...redactObject(options.extras) } : envelope);
  } else {
    (options.logError ?? logError)(redactedMessage);
  }
  return exitCode;
}

function parseError(
  command: string,
  err: unknown,
): { exitCode: number; message: string; kind?: string; requestId?: string } {
  if (err instanceof ProxyError) {
    let message = `${command} failed (${err.code}): ${err.message}`;
    if (err.code === "user_unauthorized") {
      message +=
        "\n  hint: the active GitHub token may lack the read:org scope or SSO authorization for the org. " +
        "$GITHUB_TOKEN / $GH_TOKEN override `gh auth token` — run `universe whoami` to check the active identity source, " +
        "then unset them or re-authorize the token (Configure SSO).";
    } else if (err.hint) {
      message += `\n  hint: ${err.hint}`;
    }
    return {
      exitCode: err.exitCode,
      message,
      kind: err.code,
      requestId: err.requestId,
    };
  }
  if (err instanceof CliError) {
    return { exitCode: err.exitCode, message: err.message };
  }
  if (err instanceof Error) {
    return { exitCode: EXIT_USAGE, message: err.message };
  }
  return { exitCode: EXIT_USAGE, message: String(err) };
}

export { emitJson, outputError, outputSuccess };
export type { OutputContext, OutputErrorOptions };
