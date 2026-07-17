import { spinner } from "@clack/prompts";

interface Spinner {
  start(msg?: string): void;
  message(msg?: string): void;
  stop(msg?: string): void;
}

const clackSpinner = (): Spinner => {
  const s = spinner();
  return {
    start: (msg) => s.start(msg),
    message: (msg) => s.message(msg),
    stop: (msg) => s.stop(msg),
  };
};

const silentSpinner = (): Spinner => ({
  start: () => {},
  message: () => {},
  stop: () => {},
});

export { clackSpinner, silentSpinner };
export type { Spinner };
