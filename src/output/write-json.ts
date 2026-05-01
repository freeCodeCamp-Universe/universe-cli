import { buildEnvelope, buildErrorEnvelope } from "./envelope.js";

const writeJson = (command: string, ok: boolean, data: Record<string, unknown>): void => {
  process.stdout.write(`${JSON.stringify(buildEnvelope(command, ok, data))}\n`);
};

const writeErrorJson = (
  command: string,
  code: number,
  message: string,
  issues?: string[],
): void => {
  process.stdout.write(`${JSON.stringify(buildErrorEnvelope(command, code, message, issues))}\n`);
};

export { writeErrorJson, writeJson };
