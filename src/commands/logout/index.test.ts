import type { TokenStore } from "../../auth/token-store.port.js";
import { writeJson } from "../../output/write-json.js";
import { handleLogout } from "./index.js";

vi.mock(import("../../output/write-json.js"));

const makeDeps = () => {
  const tokenStore = {
    deleteToken: vi.fn().mockResolvedValue(undefined),
    loadToken: vi.fn().mockResolvedValue("existing-token"),
    saveToken: vi.fn(),
  } satisfies TokenStore;
  return {
    logger: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warn: vi.fn() },
    tokenStore,
  };
};

describe(handleLogout, () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("deletes the existing token", async () => {
    const deps = makeDeps();
    const deleteSpy = vi.spyOn(deps.tokenStore, "deleteToken");
    await handleLogout({ json: false }, deps);
    expect(deleteSpy).toHaveBeenCalledOnce();
  });

  it("reports 'no token' when nothing was stored (text mode)", async () => {
    const deps = makeDeps();
    deps.tokenStore.loadToken.mockResolvedValue(null);
    await handleLogout({ json: false }, deps);
    expect(deps.logger.info).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/no token/i));
  });

  it("with json: true calls writeJson with removed=true", async () => {
    const deps = makeDeps();
    await handleLogout({ json: true }, deps);
    expect(writeJson).toHaveBeenCalledWith(
      "logout",
      true,
      expect.objectContaining({ removed: true }),
    );
  });

  it("emits removed=false when no token existed (JSON mode)", async () => {
    const deps = makeDeps();
    deps.tokenStore.loadToken.mockResolvedValue(null);
    await handleLogout({ json: true }, deps);
    expect(writeJson).toHaveBeenCalledWith(
      "logout",
      true,
      expect.objectContaining({ removed: false }),
    );
  });
});
