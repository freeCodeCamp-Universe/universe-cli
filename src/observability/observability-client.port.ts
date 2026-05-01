interface ObservabilityClient {
  track(event: string, properties?: Record<string, unknown>): void;
  error(error: Error, context?: Record<string, unknown>): void;
  safeTrack(event: string, properties?: Record<string, unknown>): void;
  safeError(error: unknown, context?: Record<string, unknown>): void;
}

export type { ObservabilityClient };
