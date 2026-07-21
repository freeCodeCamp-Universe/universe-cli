import { spinner } from "@clack/prompts";

interface Spinner {
  error(msg?: string): void;
  start(msg?: string): void;
  message(msg?: string): void;
  stop(msg?: string): void;
}

const clackSpinner = (): Spinner => 
  spinner();

const silentSpinner = (): Spinner => ({
  error: 
() => {},
   start: () => {},
  message: () => {},
  stop: () => {},
});

export { clackSpinner, silentSpinner };
export type { Spinner };
