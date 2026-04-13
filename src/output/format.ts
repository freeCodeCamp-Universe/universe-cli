import { log } from "@clack/prompts";
import { buildEnvelope, buildErrorEnvelope } from "./envelope.js";
import { redact } from "./redact.js";

export type OutputContext = {
  json: boolean;
  command: string;
};

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
  issues?: string[],
): void {
  const redactedMessage = redact(message);
  const redactedIssues = issues?.map(redact);

  if (ctx.json) {
    const envelope = buildErrorEnvelope(
      ctx.command,
      code,
      redactedMessage,
      redactedIssues,
    );
    process.stdout.write(JSON.stringify(envelope) + "\n");
  } else {
    log.error(redactedMessage);
  }
}
