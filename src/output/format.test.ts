import type { OutputContext } from "./format.js";
import { outputSuccess, outputError } from "./format.js";

describe(outputSuccess, () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls stdout once in json mode", () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const ctx: OutputContext = { command: "deploy", json: true };
    outputSuccess(ctx, "Deployed!", { deployId: "abc-123" });

    expect(stdoutSpy).toHaveBeenCalledOnce();
  });

  it("json envelope contains correct schema fields", () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const ctx: OutputContext = { command: "deploy", json: true };
    outputSuccess(ctx, "Deployed!", { deployId: "abc-123" });

    const [rawOutput] = stdoutSpy.mock.calls[0]!;
    const parsed = JSON.parse(rawOutput as string) as Record<string, unknown>;
    expect(parsed["schemaVersion"]).toBe("1");
    expect(parsed["command"]).toBe("deploy");
    expect(parsed["success"]).toBe(true);
    expect(parsed["deployId"]).toBe("abc-123");
    expect(parsed["timestamp"]).toBeDefined();
  });

  it("jSON output is a single line (no newlines in body)", () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const ctx: OutputContext = { command: "deploy", json: true };
    outputSuccess(ctx, "Done", { id: "x" });

    const [rawOutput] = stdoutSpy.mock.calls[0]!;
    const lines = (rawOutput as string).trimEnd().split("\n");
    expect(lines).toHaveLength(1);
  });

  it("uses @clack/prompts log.success in human mode", async () => {
    const clack = await import("@clack/prompts");
    const logSpy = vi.spyOn(clack.log, "success").mockImplementation(() => {});
    const ctx: OutputContext = { command: "deploy", json: false };
    outputSuccess(ctx, "Deployed successfully!", { deployId: "abc" });

    expect(logSpy).toHaveBeenCalledWith("Deployed successfully!");
  });
});

describe(outputError, () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes JSON error envelope to stdout in json mode", () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const ctx: OutputContext = { command: "deploy", json: true };
    outputError(ctx, 11, "config not found", ["missing bucket"]);

    const output = stdoutSpy.mock.calls[0]![0] as string;
    const parsed = JSON.parse(output) as {
      schemaVersion: string;
      success: boolean;
      error: { code: number; message: string; issues: string[] };
    };
    expect(parsed.schemaVersion).toBe("1");
    expect(parsed.success).toBe(false);
    expect(parsed.error.code).toBe(11);
    expect(parsed.error.message).toBe("config not found");
    expect(parsed.error.issues).toStrictEqual(["missing bucket"]);
  });

  it("uses @clack/prompts log.error in human mode", async () => {
    const clack = await import("@clack/prompts");
    const logSpy = vi.spyOn(clack.log, "error").mockImplementation(() => {});
    const ctx: OutputContext = { command: "deploy", json: false };
    outputError(ctx, 11, "config not found");

    expect(logSpy).toHaveBeenCalledWith("config not found");
  });

  it("redacts credentials in error messages (json mode)", () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const ctx: OutputContext = { command: "deploy", json: true };
    outputError(ctx, 12, "Bad key: AKIAIOSFODNN7EXAMPLE");

    const output = stdoutSpy.mock.calls[0]![0] as string;
    const parsed = JSON.parse(output) as { error: { message: string } };
    expect(parsed.error.message).toContain("****");
    expect(parsed.error.message).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("redacts credentials in error messages (human mode)", async () => {
    const clack = await import("@clack/prompts");
    const logSpy = vi.spyOn(clack.log, "error").mockImplementation(() => {});
    const ctx: OutputContext = { command: "deploy", json: false };
    outputError(ctx, 12, "Bad key: AKIAIOSFODNN7EXAMPLE");

    const [msg] = logSpy.mock.calls[0]!;
    expect(msg).toContain("****");
    expect(msg).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("redacts credentials in issues array", () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const ctx: OutputContext = { command: "deploy", json: true };
    outputError(ctx, 12, "error", ["key: AKIAIOSFODNN7EXAMPLE"]);

    const output = stdoutSpy.mock.calls[0]![0] as string;
    const parsed = JSON.parse(output) as { error: { issues: string[] } };
    expect(parsed.error.issues[0]).toContain("****");
  });
});
