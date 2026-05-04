import { BaseSafeObservabilityClient } from "./safe-observability-client.js";

class ThrowingClient extends BaseSafeObservabilityClient {
  track(): void {
    throw new Error("o11y backend unavailable");
  }

  error(): void {
    throw new Error("o11y backend unavailable");
  }
}

describe(BaseSafeObservabilityClient, () => {
  describe("safeTrack", () => {
    it("swallows errors thrown by the client", () => {
      const client = new ThrowingClient();
      expect(() => client.safeTrack("test-event")).not.toThrow();
    });

    it("swallows errors when properties are provided", () => {
      const client = new ThrowingClient();
      expect(() => client.safeTrack("test-event", { key: "value" })).not.toThrow();
    });
  });

  describe("safeError", () => {
    it("swallows errors thrown by the client", () => {
      const client = new ThrowingClient();
      expect(() => client.safeError(new Error("original error"))).not.toThrow();
    });

    it("swallows errors when context is provided", () => {
      const client = new ThrowingClient();
      expect(() =>
        client.safeError(new Error("original error"), { command: "create" }),
      ).not.toThrow();
    });
  });
});
