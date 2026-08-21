import { spinner } from "@clack/prompts";

interface Spinner {
  error(message?: string): void;
  start(message?: string): void;
  message(message?: string): void;
  stop(message?: string): void;
}

const clackSpinner = (): Spinner => spinner();
const silentSpinner = (): Spinner => ({
  error: () => {},
  message: () => {},
  start: () => {},
  stop: () => {},
});

export { clackSpinner, silentSpinner };
export type { Spinner };
