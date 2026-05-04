import type { IdentityResolver } from "../../auth/identity-resolver.port.js";
import { CredentialError } from "../../errors/cli-errors.js";
import { EXIT_CREDENTIALS, EXIT_STORAGE } from "../../errors/exit-codes.js";
import { writeErrorJson, writeJson } from "../../output/write-json.js";
import { ProxyError } from "../../platform/proxy-client.port.js";
import type { ProxyClient } from "../../platform/proxy-client.port.js";
import { handleWhoami } from "./index.js";

vi.mock(import("../../output/write-json.js"));

const makeDeps = () => {
  const identityResolver: IdentityResolver = {
    resolve: vi.fn().mockResolvedValue({ source: "env_GITHUB_TOKEN", token: "token-abc" }),
  };
  const proxyClient: ProxyClient = {
    deployFinalize: vi.fn(),
    deployInit: vi.fn(),
    deployUpload: vi.fn(),
    siteDeploys: vi.fn(),
    sitePromote: vi.fn(),
    siteRollback: vi.fn(),
    whoami: vi
      .fn()
      .mockResolvedValue({ authorizedSites: ["site-a", "site-b"], login: "staffuser" }),
  };
  return {
    identityResolver,
    logger: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warn: vi.fn() },
    proxyClient,
  };
};

describe(handleWhoami, () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("throws CredentialError when identity resolves to null", async () => {
    const deps = makeDeps();
    vi.spyOn(deps.identityResolver, "resolve").mockResolvedValue(null);
    await expect(handleWhoami({ json: false }, deps)).rejects.toThrow(CredentialError);
  });

  it("calls proxyClient.whoami()", async () => {
    const deps = makeDeps();
    const whoamiSpy = vi.spyOn(deps.proxyClient, "whoami");
    await handleWhoami({ json: false }, deps);
    expect(whoamiSpy).toHaveBeenCalledOnce();
  });

  it("with json: false prints login and authorized sites via logger.success", async () => {
    const deps = makeDeps();
    await handleWhoami({ json: false }, deps);
    expect(deps.logger.success).toHaveBeenCalledWith(expect.stringContaining("staffuser"));
    const calls = deps.logger.success.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(calls.some((msg) => msg.includes("staffuser"))).toBe(true);
    expect(calls.some((msg) => msg.includes("site-a"))).toBe(true);
  });

  it("with json: true calls writeJson with login, authorizedSites, identitySource", async () => {
    const deps = makeDeps();
    await handleWhoami({ json: true }, deps);
    expect(writeJson).toHaveBeenCalledWith("whoami", true, {
      authorizedSites: ["site-a", "site-b"],
      identitySource: "env_GITHUB_TOKEN",
      login: "staffuser",
    });
  });

  it("proxyError from whoami propagates with correct exitCode", async () => {
    const deps = makeDeps();
    vi.spyOn(deps.proxyClient, "whoami").mockRejectedValue(
      new ProxyError(401, "unauth", "bad token"),
    );
    const err = await handleWhoami({ json: false }, deps).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProxyError);
    expect((err as ProxyError).exitCode).toBe(EXIT_CREDENTIALS);
  });

  it("in JSON mode, calls writeErrorJson before rethrowing", async () => {
    const deps = makeDeps();
    vi.spyOn(deps.proxyClient, "whoami").mockRejectedValue(new ProxyError(503, "upstream", "down"));
    await expect(handleWhoami({ json: true }, deps)).rejects.toBeInstanceOf(ProxyError);
    expect(writeErrorJson).toHaveBeenCalledWith(
      "whoami",
      EXIT_STORAGE,
      expect.stringContaining("down"),
    );
  });
});
