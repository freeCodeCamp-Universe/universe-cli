import { describe, expect, it, vi } from "vitest";
import { login, loginHandler } from "../../src/commands/login.js";
import { DEFAULT_GH_CLIENT_ID } from "../../src/lib/constants.js";
import type { Step, StepResponse } from "../../src/interaction/step.js";
import type { CommandResult } from "../../src/output/command-result.js";

function mkFakeProxyClient(
  whoamiImpl?: () => Promise<{
    login: string;
    authorizedSites: Array<{ slug: string; teams: string[] }>;
  }>,
) {
  return vi.fn().mockReturnValue({
    whoami:
      whoamiImpl ??
      (async () => ({
        login: "test-user",
        authorizedSites: [{ slug: "test-site", teams: ["staff"] }],
      })),
  });
}

function mkSdkDeps(overrides: Record<string, unknown> = {}) {
  return {
    requestDeviceCode: vi.fn().mockResolvedValue({
      device_code: "dc_test",
      user_code: "ABCD-1234",
      verification_uri: "https://github.com/login/device",
      expires_in: 900,
      interval: 5,
      userCode: "ABCD-1234",
      verificationUri: "https://github.com/login/device",
      expiresIn: 900,
    }),
    pollDeviceToken: vi.fn().mockResolvedValue("ghu_secret"),
    saveToken: vi.fn().mockResolvedValue(undefined),
    loadToken: vi.fn().mockResolvedValue(null),
    createProxyClient: mkFakeProxyClient(),
    env: { UNIVERSE_GH_CLIENT_ID: "Iv1.test" } as NodeJS.ProcessEnv,
    ...overrides,
  };
}

async function drive(
  gen: AsyncGenerator<Step, CommandResult, StepResponse>,
): Promise<{ steps: Step[]; result: CommandResult }> {
  const steps: Step[] = [];
  let next = await gen.next();
  while (!next.done) {
    steps.push(next.value);
    next = await gen.next(undefined);
  }
  return { steps, result: next.value };
}

describe("login SDK", () => {
  it("runs device flow and persists token on success", async () => {
    const deps = mkSdkDeps();
    const { result } = await drive(login({}, deps));
    expect(deps.requestDeviceCode).toHaveBeenCalledTimes(1);
    expect(deps.pollDeviceToken).toHaveBeenCalledTimes(1);
    expect(deps.saveToken).toHaveBeenCalledWith("ghu_secret");
    expect(result.data.success).toBe(true);
    expect(result.data.stored).toBe(true);
  });

  it("passes UNIVERSE_GH_CLIENT_ID env to device code request", async () => {
    const deps = mkSdkDeps({ env: { UNIVERSE_GH_CLIENT_ID: "Iv1.real_client" } });
    await drive(login({}, deps));
    const arg = deps.requestDeviceCode.mock.calls[0][0];
    expect(arg.clientId).toBe("Iv1.real_client");
  });

  it("yields info step with device-code field", async () => {
    const deps = mkSdkDeps();
    const { steps } = await drive(login({}, deps));
    const dcStep = steps.find((s) => s.type === "info" && "field" in s && s.field === "device-code");
    expect(dcStep).toBeDefined();
    expect(dcStep!.type).toBe("info");
    expect((dcStep as { data?: Record<string, unknown> }).data).toEqual(
      expect.objectContaining({ userCode: "ABCD-1234", verificationUri: "https://github.com/login/device" }),
    );
  });

  it("falls back to DEFAULT_GH_CLIENT_ID when env is unset", async () => {
    const deps = mkSdkDeps({ env: {} });
    await drive(login({}, deps));
    const arg = deps.requestDeviceCode.mock.calls[0][0];
    expect(arg.clientId).toBe(DEFAULT_GH_CLIENT_ID);
  });

  it("falls back to DEFAULT_GH_CLIENT_ID when env is empty string", async () => {
    const deps = mkSdkDeps({ env: { UNIVERSE_GH_CLIENT_ID: "" } });
    await drive(login({}, deps));
    const arg = deps.requestDeviceCode.mock.calls[0][0];
    expect(arg.clientId).toBe(DEFAULT_GH_CLIENT_ID);
  });

  it("falls back to DEFAULT_GH_CLIENT_ID when env is whitespace", async () => {
    const deps = mkSdkDeps({ env: { UNIVERSE_GH_CLIENT_ID: "   " } });
    await drive(login({}, deps));
    const arg = deps.requestDeviceCode.mock.calls[0][0];
    expect(arg.clientId).toBe(DEFAULT_GH_CLIENT_ID);
  });

  it("returns success=false when already logged in without --force", async () => {
    const deps = mkSdkDeps({ loadToken: vi.fn().mockResolvedValue("existing") });
    const { result, steps } = await drive(login({}, deps));
    expect(deps.requestDeviceCode).not.toHaveBeenCalled();
    expect(result.data.success).toBe(false);
    expect(steps.some((s) => s.type === "warning")).toBe(true);
  });

  it("overwrites existing token when force=true", async () => {
    const deps = mkSdkDeps({ loadToken: vi.fn().mockResolvedValue("existing") });
    const { result } = await drive(login({ force: true }, deps));
    expect(deps.requestDeviceCode).toHaveBeenCalledTimes(1);
    expect(deps.saveToken).toHaveBeenCalledWith("ghu_secret");
    expect(result.data.success).toBe(true);
  });

  it("throws on device-flow failure", async () => {
    const deps = mkSdkDeps({ pollDeviceToken: vi.fn().mockRejectedValue(new Error("denied")) });
    await expect(drive(login({}, deps))).rejects.toThrow("denied");
    expect(deps.saveToken).not.toHaveBeenCalled();
  });

  it("yields warning when whoami reports 0 authorized sites", async () => {
    const deps = mkSdkDeps({
      createProxyClient: mkFakeProxyClient(async () => ({
        login: "newbie",
        authorizedSites: [],
      })),
    });
    const { result, steps } = await drive(login({}, deps));
    expect(result.data.authorizedSitesCount).toBe(0);
    expect(result.data.warning).toContain("0 authorized sites");
    expect(steps.filter((s) => s.type === "warning").length).toBeGreaterThanOrEqual(1);
  });

  it("login succeeds when whoami throws (no warning)", async () => {
    const deps = mkSdkDeps({
      createProxyClient: mkFakeProxyClient(async () => {
        throw new Error("network down");
      }),
    });
    const { result } = await drive(login({}, deps));
    expect(deps.saveToken).toHaveBeenCalledWith("ghu_secret");
    expect(result.data.success).toBe(true);
    expect(result.data.warning).toBeUndefined();
  });
});

describe("loginHandler", () => {
  function mkHandlerDeps(overrides: Record<string, unknown> = {}) {
    return {
      ...mkSdkDeps(),
      logSuccess: vi.fn(),
      logWarn: vi.fn(),
      logError: vi.fn(),
      exit: vi.fn().mockImplementation((_code: number) => {
        throw new Error("__exit__");
      }),
      ...overrides,
    };
  }

  it("emits JSON envelope on success", async () => {
    const stdout: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      stdout.push(String(chunk));
      return true;
    });
    const deps = mkHandlerDeps();
    await loginHandler({ json: true }, deps);
    writeSpy.mockRestore();

    const lines = stdout.join("").trim().split("\n");
    // In JSON mode there are two envelopes: device-code + final result.
    // The last one is the final result.
    const env = JSON.parse(lines[lines.length - 1]!);
    expect(env.command).toBe("login");
    expect(env.success).toBe(true);
    expect(env.stored).toBe(true);
  });

  it("refuses to overwrite existing token without --force", async () => {
    const deps = mkHandlerDeps({ loadToken: vi.fn().mockResolvedValue("existing") });
    await expect(loginHandler({ json: false }, deps)).rejects.toThrow("__exit__");
    expect(deps.requestDeviceCode).not.toHaveBeenCalled();
    expect(deps.exit).toHaveBeenCalledWith(18);
  });

  it("propagates device-flow failure as error exit", async () => {
    const deps = mkHandlerDeps({ pollDeviceToken: vi.fn().mockRejectedValue(new Error("denied")) });
    await expect(loginHandler({ json: false }, deps)).rejects.toThrow("__exit__");
    expect(deps.exit).toHaveBeenCalledWith(12);
  });

  it("warns in text mode when whoami reports 0 authorized sites", async () => {
    const deps = mkHandlerDeps({
      createProxyClient: mkFakeProxyClient(async () => ({
        login: "newbie",
        authorizedSites: [],
      })),
    });
    await loginHandler({ json: false }, deps);
    expect(deps.logWarn).toHaveBeenCalledTimes(1);
    const warning = deps.logWarn.mock.calls[0]![0] as string;
    expect(warning).toContain("0 authorized sites");
  });
});
