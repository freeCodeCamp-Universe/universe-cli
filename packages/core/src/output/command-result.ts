import type { Envelope } from "./envelope.js";

interface CommandResult {
  data: Envelope;
  format: string;
}

export type { CommandResult };
