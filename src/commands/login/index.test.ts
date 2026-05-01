import type { DeviceFlow } from "../../auth/device-flow.port.js";
import type { IdentityResolver } from "../../auth/identity-resolver.port.js";
import type { TokenStore } from "../../auth/token-store.port.js";
import { ConfirmError, CredentialError } from "../../errors/cli-errors.js";
import { writeJson } from "../../output/write-json.js";
import { handleLogin } from "./index.js";

vi.mock(import("../../output/write-json.js"));

const makeDeps = () => {
  const tokenStore: TokenStore = {
    deleteToken: vi.fn().mockResolvedValue(undefined),
    loadToken: vi.fn().mockResolvedValue(null),
    saveToken: vi.fn().mockResolvedValue(undefined),
  };
  const deviceFlow: DeviceFlow = {
    run: vi.fn().mockImplementation(async ({ onPrompt }: Parameters<DeviceFlow["run"]>[0]) => {
      await onPrompt({ expiresIn: 900, userCode: "ABCD-1234", verificationUri: "https://gh.io" });
      return "new-token-xyz";
    }),
  };
  const identityResolver: IdentityResolver = {
    resolve: vi.fn().mockResolvedValue(null),
  };
  return {
    deviceFlow,
    identityResolver,
    logger: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warn: vi.fn() },
    tokenStore,
  };
};

describe(handleLogin, () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("throws ConfirmError when token is already stored and force is false", async () => {
    const deps = makeDeps();
    vi.spyOn(deps.tokenStore, "loadToken").mockResolvedValue("existing-token");
    await expect(handleLogin({ force: false, json: false }, deps)).rejects.toThrow(ConfirmError);
  });

  it("proceeds when token is already stored but force is true", async () => {
    const deps = makeDeps();
    vi.spyOn(deps.tokenStore, "loadToken").mockResolvedValue("existing-token");
    await expect(handleLogin({ force: true, json: false }, deps)).resolves.not.toThrow();
  });

  it("calls deviceFlow.run with a client id and scope", async () => {
    const deps = makeDeps();
    const runSpy = vi.spyOn(deps.deviceFlow, "run");
    await handleLogin({ force: false, json: false }, deps);
    const [runCall] = runSpy.mock.lastCall!;
    expect(runCall.clientId).toBe("Iv23liIuGmZRyPd5wUeN");
    expect(runCall.scope).toBe("read:org user:email");
  });

  it("calls tokenStore.saveToken with the token returned by deviceFlow", async () => {
    const deps = makeDeps();
    const saveSpy = vi.spyOn(deps.tokenStore, "saveToken");
    await handleLogin({ force: false, json: false }, deps);
    expect(saveSpy).toHaveBeenCalledWith("new-token-xyz");
  });

  it("with json: false calls logger.info and logger.success", async () => {
    const deps = makeDeps();
    await handleLogin({ force: false, json: false }, deps);
    expect(deps.logger.info).toHaveBeenCalledWith(expect.stringContaining("ABCD-1234"));
    expect(deps.logger.success).toHaveBeenCalledOnce();
  });

  it("with json: true calls writeJson twice (prompt then success)", async () => {
    const deps = makeDeps();
    vi.spyOn(deps.deviceFlow, "run").mockImplementation(async ({ onPrompt }) => {
      await onPrompt({ expiresIn: 900, userCode: "ABCD-1234", verificationUri: "https://gh.io" });
      return "new-token-xyz";
    });
    await handleLogin({ force: false, json: true }, deps);
    expect(writeJson).toHaveBeenCalledTimes(2);
    expect(writeJson).toHaveBeenNthCalledWith(
      1,
      "login",
      true,
      expect.objectContaining({ userCode: "ABCD-1234" }),
    );
    expect(writeJson).toHaveBeenNthCalledWith(2, "login", true, { stored: true });
  });

  it("uses DEFAULT_GH_CLIENT_ID when UNIVERSE_GH_CLIENT_ID is unset", async () => {
    vi.stubEnv("UNIVERSE_GH_CLIENT_ID", "");
    const deps = makeDeps();
    const runSpy = vi.spyOn(deps.deviceFlow, "run");
    await handleLogin({ force: false, json: false }, deps);
    expect(runSpy.mock.calls[0]![0].clientId).toBe("Iv23liIuGmZRyPd5wUeN");
    vi.unstubAllEnvs();
  });

  it("uses DEFAULT_GH_CLIENT_ID when UNIVERSE_GH_CLIENT_ID is whitespace", async () => {
    vi.stubEnv("UNIVERSE_GH_CLIENT_ID", "   ");
    const deps = makeDeps();
    const runSpy = vi.spyOn(deps.deviceFlow, "run");
    await handleLogin({ force: false, json: false }, deps);
    expect(runSpy.mock.calls[0]![0].clientId).toBe("Iv23liIuGmZRyPd5wUeN");
    vi.unstubAllEnvs();
  });

  it("propagates device-flow failure as CredentialError", async () => {
    const deps = makeDeps();
    vi.spyOn(deps.deviceFlow, "run").mockRejectedValue(new Error("access_denied"));
    const saveTokenSpy = vi.spyOn(deps.tokenStore, "saveToken");
    await expect(handleLogin({ force: false, json: false }, deps)).rejects.toThrow(CredentialError);
    expect(saveTokenSpy).not.toHaveBeenCalled();
  });
});
