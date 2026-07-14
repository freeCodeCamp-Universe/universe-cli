import { log } from "@clack/prompts";
import { buildEnvelope, buildErrorEnvelope } from "./envelope.js";
import { redact, redactObject } from "./redact.js";

export type OutputContext = {
  json: boolean;
  command: string;
};

/**
 * Options passed as 4th positional to `outputError`. The 4th arg also
 * still accepts a bare `string[]` issues array for back-compat with the
 * pre-T28 signature.
 */
export interface OutputErrorOptions {
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

export function emitJson(envelope: object): void {
  process.stdout.write(JSON.stringify(envelope) + "\n");
}

export function outputSuccess(
  ctx: OutputContext,
  humanMessage: string,
  data: Record<string, unknown>,
): void {
  if (ctx.json) {
    const envelope = buildEnvelope(ctx.command, true, data);
    process.stdout.write(JSON.stringify(envelope) + "\n");
  } else {
    log.success(humanMessage);
  }
}

export function outputError(
  ctx: OutputContext,
  code: number,
  message: string,
  optsOrIssues?: OutputErrorOptions | string[],
): void {
  const opts: OutputErrorOptions = Array.isArray(optsOrIssues)
    ? { issues: optsOrIssues }
    : (optsOrIssues ?? {});
  const redactedMessage = redact(message);
  const redactedIssues = opts.issues?.map(redact);

  if (ctx.json) {
    const envelope = buildErrorEnvelope(
      ctx.command,
      code,
      redactedMessage,
      redactedIssues,
      opts.kind,
      opts.requestId,
    );
    // opts.extras passes through redactObject so a future caller who
    // stuffs a token / credential into the extras map doesn't leak it.
    // Today's only callers (promote / rollback drift) pass `{ current:
    // <deployId> }`; redact() is a no-op on a deploy id, so the
    // observable behaviour is unchanged.
    const payload = opts.extras
      ? { ...envelope, ...redactObject(opts.extras) }
      : envelope;
    process.stdout.write(JSON.stringify(payload) + "\n");
  } else {
    (
      opts.logError ?? ((m: string) => log.error(m, { output: process.stderr }))
    )(redactedMessage);
  }
}
