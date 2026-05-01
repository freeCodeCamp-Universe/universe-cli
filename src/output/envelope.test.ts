import { buildEnvelope, buildErrorEnvelope } from "./envelope.js";

describe(buildEnvelope, () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-13T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns envelope with schemaVersion, command, success, and timestamp", () => {
    const result = buildEnvelope("deploy", true);
    expect(result).toStrictEqual({
      command: "deploy",
      schemaVersion: "1",
      success: true,
      timestamp: "2026-04-13T12:00:00.000Z",
    });
  });

  it("schemaVersion is the string '1', not a number", () => {
    const result = buildEnvelope("deploy", true);
    expectTypeOf(result.schemaVersion).toBeString();
    expect(result.schemaVersion).toBe("1");
  });

  it("spreads additional data into envelope", () => {
    const result = buildEnvelope("deploy", true, {
      deployId: "abc-123",
      url: "https://example.com",
    });
    expect(result).toStrictEqual({
      command: "deploy",
      deployId: "abc-123",
      schemaVersion: "1",
      success: true,
      timestamp: "2026-04-13T12:00:00.000Z",
      url: "https://example.com",
    });
  });

  it("works with success=false", () => {
    const result = buildEnvelope("rollback", false);
    expect(result.success).toBe(false);
    expect(result.command).toBe("rollback");
  });
});

describe(buildErrorEnvelope, () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-13T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns error envelope with code and message", () => {
    const result = buildErrorEnvelope("deploy", 11, "config not found");
    expect(result).toStrictEqual({
      command: "deploy",
      error: {
        code: 11,
        message: "config not found",
      },
      schemaVersion: "1",
      success: false,
      timestamp: "2026-04-13T12:00:00.000Z",
    });
  });

  it("includes issues array when provided", () => {
    const result = buildErrorEnvelope("deploy", 11, "config not found", [
      "missing bucket",
      "missing region",
    ]);
    expect(result.error).toStrictEqual({
      code: 11,
      issues: ["missing bucket", "missing region"],
      message: "config not found",
    });
  });

  it("omits issues when not provided", () => {
    const result = buildErrorEnvelope("deploy", 12, "bad creds");
    expect(result.error).not.toHaveProperty("issues");
  });

  it("always has success=false", () => {
    const result = buildErrorEnvelope("promote", 17, "not found");
    expect(result.success).toBe(false);
  });
});
