import { buildEnvelope, buildErrorEnvelope } from "./envelope.js";
import { EXIT_USAGE } from "./exit-codes.js";
import { logError, logSuccess } from "./logger.js";
import { redact, redactObject } from "./redact.js";

interface OutputContext {
  json: boolean;
  command: string;
}

interface OutputErrorOptions {
  issues?: string[];
  extras?: Record<string, unknown>;
  logError?: (message: string) => void;
  kind?: string;
  requestId?: string;
}

interface CodedCliError extends Error {
  exitCode: number;
  code: string;
  hint?: string;
  requestId?: string;
}

function isCliError(error: unknown): error is Error & { exitCode: number } {
  return error instanceof Error && "exitCode" in error && typeof error.exitCode === "number";
}

function isCodedCliError(error: Error & { exitCode: number }): error is CodedCliError {
  return "code" in error && typeof error.code === "string";
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
    emitJson(options.extras ? { ...envelope, ...redactObject(options.extras) } : envelope);
  } else {
    (options.logError ?? logError)(redactedMessage);
  }
  return exitCode;
}

function parseError(
  command: string,
  error: unknown,
): { exitCode: number; message: string; kind?: string; requestId?: string } {
  if (isCliError(error) && isCodedCliError(error)) {
    let message = `${command} failed (${error.code}): ${error.message}`;
    if (error.code === "user_unauthorized") {
      message +=
        "\n  hint: the active GitHub token may lack the read:org scope or SSO authorization for the org. " +
        "$GITHUB_TOKEN / $GH_TOKEN override `gh auth token` — run `universe whoami` to check the active identity source, " +
        "then unset them or re-authorize the token (Configure SSO).";
    } else if (error.hint) {
      message += `\n  hint: ${error.hint}`;
    }
    return {
      exitCode: error.exitCode,
      message,
      kind: error.code,
      requestId: error.requestId,
    };
  }
  if (isCliError(error)) return { exitCode: error.exitCode, message: error.message };
  if (error instanceof Error) return { exitCode: EXIT_USAGE, message: error.message };
  return { exitCode: EXIT_USAGE, message: String(error) };
}

export { emitJson, outputError, outputSuccess };
export type { OutputContext, OutputErrorOptions };
