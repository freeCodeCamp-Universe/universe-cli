import { describe, it, expect, vi, afterEach } from "vitest";
import type { OutputContext } from "../../src/output/format.js";
import { outputSuccess, outputError } from "../../src/output/format.js";

describe("outputSuccess", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes JSON envelope to stdout in json mode", () => {
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const ctx: OutputContext = { json: true, command: "deploy" };
    outputSuccess(ctx, "Deployed!", { deployId: "abc-123" });

    expect(stdoutSpy).toHaveBeenCalledOnce();
    const output = stdoutSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.schemaVersion).toBe("1");
    expect(parsed.command).toBe("deploy");
    expect(parsed.success).toBe(true);
    expect(parsed.deployId).toBe("abc-123");
    expect(parsed.timestamp).toBeDefined();
  });

  it("JSON output is a single line (no newlines in body)", () => {
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const ctx: OutputContext = { json: true, command: "deploy" };
    outputSuccess(ctx, "Done", { id: "x" });

    const output = stdoutSpy.mock.calls[0][0] as string;
    const lines = output.trimEnd().split("\n");
    expect(lines).toHaveLength(1);
  });

  it("uses @clack/prompts log.success in human mode", async () => {
    const clack = await import("@clack/prompts");
    const logSpy = vi.spyOn(clack.log, "success").mockImplementation(() => {});
    const ctx: OutputContext = { json: false, command: "deploy" };
    outputSuccess(ctx, "Deployed successfully!", { deployId: "abc" });

    expect(logSpy).toHaveBeenCalledWith("Deployed successfully!");
  });
});

describe("outputError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes JSON error envelope to stdout in json mode", () => {
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const ctx: OutputContext = { json: true, command: "deploy" };
    outputError(ctx, 11, "config not found", ["missing bucket"]);

    const output = stdoutSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.schemaVersion).toBe("1");
    expect(parsed.success).toBe(false);
    expect(parsed.error.code).toBe(11);
    expect(parsed.error.message).toBe("config not found");
    expect(parsed.error.issues).toEqual(["missing bucket"]);
  });

  it("uses @clack/prompts log.error in human mode", async () => {
    const clack = await import("@clack/prompts");
    const logSpy = vi.spyOn(clack.log, "error").mockImplementation(() => {});
    const ctx: OutputContext = { json: false, command: "deploy" };
    outputError(ctx, 11, "config not found");

    expect(logSpy).toHaveBeenCalledWith("config not found");
  });

  it("redacts credentials in error messages (json mode)", () => {
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const ctx: OutputContext = { json: true, command: "deploy" };
    outputError(ctx, 12, "Bad key: AKIAIOSFODNN7EXAMPLE");

    const output = stdoutSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.error.message).toContain("****");
    expect(parsed.error.message).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("redacts credentials in error messages (human mode)", async () => {
    const clack = await import("@clack/prompts");
    const logSpy = vi.spyOn(clack.log, "error").mockImplementation(() => {});
    const ctx: OutputContext = { json: false, command: "deploy" };
    outputError(ctx, 12, "Bad key: AKIAIOSFODNN7EXAMPLE");

    const msg = logSpy.mock.calls[0][0] as string;
    expect(msg).toContain("****");
    expect(msg).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("redacts credentials in issues array", () => {
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const ctx: OutputContext = { json: true, command: "deploy" };
    outputError(ctx, 12, "error", ["key: AKIAIOSFODNN7EXAMPLE"]);

    const output = stdoutSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.error.issues[0]).toContain("****");
  });

  // promote/rollback drift envelopes need to carry a top-level `current`
  // so scripted callers can re-pin expectedCurrent and retry; envelope
  // extension via opts.extras keeps the single chokepoint while still
  // allowing per-command shape additions.
  it("merges opts.extras into the JSON envelope at the top level", () => {
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const ctx: OutputContext = { json: true, command: "promote" };
    outputError(ctx, 30, "drift detected", {
      extras: { current: "20260427-abc1234" },
    });

    const parsed = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
    expect(parsed.success).toBe(false);
    expect(parsed.current).toBe("20260427-abc1234");
  });

  // Commands inject their own logError via deps to keep tests
  // hermetic — opts.logError lets outputError delegate to that fn
  // instead of clack's default, while still redacting first.
  it("uses opts.logError (dep-injected) over clack default in human mode", () => {
    const logFn = vi.fn();
    const ctx: OutputContext = { json: false, command: "deploy" };
    const secret = "abcdef1234567890abcdef1234567890";
    outputError(ctx, 12, `Bearer ${secret}`, { logError: logFn });

    expect(logFn).toHaveBeenCalledTimes(1);
    const msg = logFn.mock.calls[0][0] as string;
    expect(msg).toContain("****");
    expect(msg).not.toContain(secret);
  });

  // Back-compat: third positional may still be a bare issues array.
  it("accepts issues[] as third positional for back-compat", () => {
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const ctx: OutputContext = { json: true, command: "deploy" };
    outputError(ctx, 11, "broken", ["one", "two"]);

    const parsed = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
    expect(parsed.error.issues).toEqual(["one", "two"]);
  });
});
