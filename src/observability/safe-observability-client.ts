import type { ObservabilityClient } from "./observability-client.port.js";

abstract class BaseSafeObservabilityClient implements ObservabilityClient {
  abstract track(event: string, properties?: Record<string, unknown>): void;
  abstract error(error: Error, context?: Record<string, unknown>): void;

  safeTrack(event: string, properties?: Record<string, unknown>): void {
    try {
      this.track(event, properties);
    } catch {
      // O11y is best-effort; failures are intentionally swallowed
    }
  }

  safeError(error: Error, context?: Record<string, unknown>): void {
    try {
      this.error(error, context);
    } catch {
      // O11y is best-effort; failures are intentionally swallowed
    }
  }
}

export { BaseSafeObservabilityClient };
