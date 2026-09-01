import { describe, it, expect, vi, afterEach } from "vitest";
import type { OutputContext } from "../../src/output/format.js";
import { outputSuccess, outputError } from "../../src/output/format.js";
import { ProxyError } from "../../src/lib/proxy-client.js";
import { ConfigError, CredentialError, PartialUploadError } from "../../src/errors.js";

describe("outputSuccess", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes JSON envelope to stdout in json mode", () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
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
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
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
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const ctx: OutputContext = { json: true, command: "deploy" };
    outputError(ctx, new ConfigError("config not found"), { issues: ["missing bucket"] });

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
    outputError(ctx, new ConfigError("config not found"));

    expect(logSpy).toHaveBeenCalledWith("config not found", {
      output: process.stderr,
    });
  });

  it("redacts credentials in error messages (json mode)", () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const ctx: OutputContext = { json: true, command: "deploy" };
    outputError(ctx, new CredentialError("Bad key: AKIAIOSFODNN7EXAMPLE"));

    const output = stdoutSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.error.message).toContain("****");
    expect(parsed.error.message).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("redacts credentials in error messages (human mode)", async () => {
    const clack = await import("@clack/prompts");
    const logSpy = vi.spyOn(clack.log, "error").mockImplementation(() => {});
    const ctx: OutputContext = { json: false, command: "deploy" };
    outputError(ctx, new CredentialError("Bad key: AKIAIOSFODNN7EXAMPLE"));

    const msg = logSpy.mock.calls[0][0] as string;
    expect(msg).toContain("****");
    expect(msg).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("redacts credentials in issues array", () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const ctx: OutputContext = { json: true, command: "deploy" };
    outputError(ctx, new CredentialError("error"), {
      issues: ["key: AKIAIOSFODNN7EXAMPLE"],
    });

    const output = stdoutSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.error.issues[0]).toContain("****");
  });

  // promote/rollback drift envelopes need to carry a top-level `current`
  // so scripted callers can re-pin expectedCurrent and retry; envelope
  // extension via opts.extras keeps the single chokepoint while still
  // allowing per-command shape additions.
  it("merges opts.extras into the JSON envelope at the top level", () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const ctx: OutputContext = { json: true, command: "promote" };
    outputError(ctx, new PartialUploadError("drift detected"), {
      extras: { current: "20260427-abc1234" },
    });

    const parsed = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
    expect(parsed.success).toBe(false);
    expect(parsed.current).toBe("20260427-abc1234");
  });

  // Future-proofing: opts.extras must pass through redactObject so a
  // caller who stuffs a credential into extras can't leak it. Today's
  // only callers pass deploy ids (redact-clean), but the API surface
  // must not be a footgun.
  it("redacts credentials inside opts.extras", () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const ctx: OutputContext = { json: true, command: "promote" };
    const secret = "abcdef1234567890abcdef1234567890";
    outputError(ctx, new PartialUploadError("drift detected"), {
      extras: {
        current: "20260427-abc1234",
        token: `Bearer ${secret}`,
      },
    });

    const parsed = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
    expect(parsed.current).toBe("20260427-abc1234");
    expect(parsed.token).not.toContain(secret);
    expect(parsed.token).toContain("****");
  });

  // Commands inject their own logError via deps to keep tests
  // hermetic — opts.logError lets outputError delegate to that fn
  // instead of clack's default, while still redacting first.
  it("uses opts.logError (dep-injected) over clack default in human mode", () => {
    const logFn = vi.fn();
    const ctx: OutputContext = { json: false, command: "deploy" };
    const secret = "abcdef1234567890abcdef1234567890";
    outputError(ctx, new CredentialError(`Bearer ${secret}`), { logError: logFn });

    expect(logFn).toHaveBeenCalledTimes(1);
    const msg = logFn.mock.calls[0][0] as string;
    expect(msg).toContain("****");
    expect(msg).not.toContain(secret);
  });

  it("includes issues supplied through options", () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const ctx: OutputContext = { json: true, command: "deploy" };
    outputError(ctx, new ConfigError("broken"), { issues: ["one", "two"] });

    const parsed = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
    expect(parsed.error.issues).toEqual(["one", "two"]);
  });

  it("includes kind and requestId in the JSON error envelope", () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const ctx: OutputContext = { json: true, command: "repo list" };
    outputError(ctx, new CredentialError("denied"), {
      kind: "user_unauthorized",
      requestId: "req-1",
    });

    const parsed = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
    expect(parsed.error.kind).toBe("user_unauthorized");
    expect(parsed.error.requestId).toBe("req-1");
  });

  describe("error overload (ctx, err, opts?)", () => {
    it("formats a ProxyError via wrapProxyError and returns EXIT_CREDENTIALS", () => {
      const logFn = vi.fn();
      const ctx: OutputContext = { json: false, command: "deploy" };
      const code = outputError(ctx, new ProxyError(403, "user_unauthorized", "denied"), {
        logError: logFn,
      });
      expect(code).toBe(12);
      const msg = logFn.mock.calls[0][0] as string;
      expect(msg).toContain("deploy failed (user_unauthorized)");
      expect(msg).toContain("read:org");
    });

    it("formats a CliError and returns its exit code", () => {
      const logFn = vi.fn();
      const ctx: OutputContext = { json: false, command: "init" };
      const code = outputError(ctx, new ConfigError("bad yaml"), { logError: logFn });
      expect(code).toBe(11);
      expect(logFn).toHaveBeenCalledWith("bad yaml");
    });

    it("formats a generic Error and returns EXIT_USAGE", () => {
      const logFn = vi.fn();
      const ctx: OutputContext = { json: false, command: "whoami" };
      const code = outputError(ctx, new TypeError("fetch failed"), { logError: logFn });
      expect(code).toBe(10);
      expect(logFn).toHaveBeenCalledWith("fetch failed");
    });

    it("auto-merges kind and requestId into JSON envelope", () => {
      const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      const ctx: OutputContext = { json: true, command: "repo approve" };
      const code = outputError(ctx, new ProxyError(500, "r2_put_failed", "timeout", "req-42"));
      expect(code).toBe(13);
      const parsed = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
      expect(parsed.error.kind).toBe("r2_put_failed");
      expect(parsed.error.requestId).toBe("req-42");
    });

    it("caller-supplied kind/requestId take precedence", () => {
      const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      const ctx: OutputContext = { json: true, command: "deploy" };
      outputError(ctx, new ProxyError(500, "r2_put_failed", "timeout", "req-42"), {
        kind: "custom_kind",
        requestId: "custom-req",
      });
      const parsed = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
      expect(parsed.error.kind).toBe("custom_kind");
      expect(parsed.error.requestId).toBe("custom-req");
    });

    it("passes extras through to the JSON envelope", () => {
      const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      const ctx: OutputContext = { json: true, command: "promote" };
      outputError(ctx, new ProxyError(409, "alias_drift", "stale"), {
        extras: { current: "deploy-xyz" },
      });
      const parsed = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
      expect(parsed.current).toBe("deploy-xyz");
    });
  });

  describe("wrapProxyError authz hint (via error overload)", () => {
    it("appends a read:org / SSO hint on user_unauthorized", () => {
      const logFn = vi.fn();
      const ctx: OutputContext = { json: false, command: "repo approve" };
      const code = outputError(
        ctx,
        new ProxyError(403, "user_unauthorized", "caller is not on the required team"),
        { logError: logFn },
      );
      expect(code).toBe(12); // EXIT_CREDENTIALS
      const msg = logFn.mock.calls[0][0] as string;
      expect(msg).toContain("user_unauthorized");
      expect(msg).toMatch(/read:org/);
      expect(msg).toMatch(/whoami/);
      expect(msg).toMatch(/GITHUB_TOKEN/);
    });

    it("does not add the hint for unrelated proxy errors", () => {
      const logFn = vi.fn();
      const ctx: OutputContext = { json: false, command: "repo create" };
      outputError(ctx, new ProxyError(409, "already_exists", "a request already exists"), {
        logError: logFn,
      });
      const msg = logFn.mock.calls[0][0] as string;
      expect(msg).not.toMatch(/read:org/);
    });
  });

  describe("wrapProxyError server hint (via error overload)", () => {
    it("appends the server hint on a missing_index error", () => {
      const logFn = vi.fn();
      const ctx: OutputContext = { json: false, command: "promote" };
      const code = outputError(
        ctx,
        new ProxyError(
          422,
          "missing_index",
          "target deploy has no root index.html; it cannot be served at /",
          undefined,
          "This looks like a framework build directory, not a static export.",
        ),
        { logError: logFn },
      );
      expect(code).toBe(13); // EXIT_STORAGE
      const msg = logFn.mock.calls[0][0] as string;
      expect(msg).toContain("missing_index");
      expect(msg).toContain("hint:");
      expect(msg).toContain("framework build directory");
    });

    it("adds no hint line when the server sent none", () => {
      const logFn = vi.fn();
      const ctx: OutputContext = { json: false, command: "rollback" };
      outputError(
        ctx,
        new ProxyError(422, "missing_index", "target deploy has no root index.html"),
        { logError: logFn },
      );
      const msg = logFn.mock.calls[0][0] as string;
      expect(msg).not.toContain("hint:");
    });
  });
});
