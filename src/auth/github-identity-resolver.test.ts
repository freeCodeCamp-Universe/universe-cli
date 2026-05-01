import { GithubIdentityResolver } from "./github-identity-resolver.js";

const mkEnv = (overrides: Record<string, string | undefined>): NodeJS.ProcessEnv => {
  const out: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(overrides)) {
    if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
};

describe(GithubIdentityResolver, () => {
  describe("returns null when no source matches", () => {
    it("resolves to null when all slots are empty", async () => {
      const resolver = new GithubIdentityResolver({
        env: mkEnv({}),
        execGhAuthToken: () => Promise.resolve(null),
        loadStoredToken: () => Promise.resolve(null),
      });
      await expect(resolver.resolve()).resolves.toBeNull();
    });
  });

  describe("slot 1 — env vars", () => {
    it("uses $GITHUB_TOKEN when set", async () => {
      const resolver = new GithubIdentityResolver({
        env: mkEnv({ GITHUB_TOKEN: "ghp_env" }),
        execGhAuthToken: () => Promise.resolve("should_not_run"),
        loadStoredToken: () => Promise.resolve("should_not_run"),
      });
      await expect(resolver.resolve()).resolves.toStrictEqual({
        source: "env_GITHUB_TOKEN",
        token: "ghp_env",
      });
    });

    it("uses $GH_TOKEN when GITHUB_TOKEN is absent", async () => {
      const resolver = new GithubIdentityResolver({
        env: mkEnv({ GH_TOKEN: "ghp_gh" }),
        execGhAuthToken: () => Promise.resolve("should_not_run"),
        loadStoredToken: () => Promise.resolve("should_not_run"),
      });
      await expect(resolver.resolve()).resolves.toStrictEqual({
        source: "env_GH_TOKEN",
        token: "ghp_gh",
      });
    });

    it("prefers GITHUB_TOKEN over GH_TOKEN when both set", async () => {
      const resolver = new GithubIdentityResolver({
        env: mkEnv({ GH_TOKEN: "lose", GITHUB_TOKEN: "win" }),
        execGhAuthToken: () => Promise.resolve(null),
        loadStoredToken: () => Promise.resolve(null),
      });
      const r = await resolver.resolve();
      expect(r?.token).toBe("win");
    });

    it("ignores empty env values and falls through", async () => {
      const resolver = new GithubIdentityResolver({
        env: mkEnv({ GH_TOKEN: "", GITHUB_TOKEN: "" }),
        execGhAuthToken: () => Promise.resolve(null),
        loadStoredToken: () => Promise.resolve("device"),
      });
      const r = await resolver.resolve();
      expect(r?.source).toBe("device_flow");
    });

    it("ignores ACTIONS_ID_TOKEN vars (GHA OIDC slot removed)", async () => {
      const resolver = new GithubIdentityResolver({
        env: mkEnv({
          ACTIONS_ID_TOKEN_REQUEST_TOKEN: "gha_req",
          ACTIONS_ID_TOKEN_REQUEST_URL: "https://gha.example/token",
        }),
        execGhAuthToken: () => Promise.resolve("ghcli"),
        loadStoredToken: () => Promise.resolve("device_lose"),
      });
      const r = await resolver.resolve();
      expect(r?.source).toBe("gh_cli");
    });
  });

  describe("slot 2 — gh auth token shell-out", () => {
    it("uses gh auth token output when no env match", async () => {
      const resolver = new GithubIdentityResolver({
        env: mkEnv({}),
        execGhAuthToken: () => Promise.resolve("gho_cli"),
        loadStoredToken: () => Promise.resolve("should_not_run"),
      });
      await expect(resolver.resolve()).resolves.toStrictEqual({
        source: "gh_cli",
        token: "gho_cli",
      });
    });

    it("trims whitespace from gh output", async () => {
      const resolver = new GithubIdentityResolver({
        env: mkEnv({}),
        execGhAuthToken: () => Promise.resolve("  gho_trim  \n"),
        loadStoredToken: () => Promise.resolve(null),
      });
      const r = await resolver.resolve();
      expect(r?.token).toBe("gho_trim");
    });

    it("falls through when gh returns null", async () => {
      const resolver = new GithubIdentityResolver({
        env: mkEnv({}),
        execGhAuthToken: () => Promise.resolve(null),
        loadStoredToken: () => Promise.resolve("stored"),
      });
      expect((await resolver.resolve())?.source).toBe("device_flow");
    });

    it("falls through when gh returns empty string", async () => {
      const resolver = new GithubIdentityResolver({
        env: mkEnv({}),
        execGhAuthToken: () => Promise.resolve(""),
        loadStoredToken: () => Promise.resolve("stored"),
      });
      expect((await resolver.resolve())?.source).toBe("device_flow");
    });
  });

  describe("slot 3 — device-flow stored token", () => {
    it("uses stored token as last resort", async () => {
      const resolver = new GithubIdentityResolver({
        env: mkEnv({}),
        execGhAuthToken: () => Promise.resolve(null),
        loadStoredToken: () => Promise.resolve("stored_tok"),
      });
      await expect(resolver.resolve()).resolves.toStrictEqual({
        source: "device_flow",
        token: "stored_tok",
      });
    });
  });

  describe("priority order", () => {
    it("env beats gh CLI beats device flow", async () => {
      const resolver = new GithubIdentityResolver({
        env: mkEnv({ GITHUB_TOKEN: "env_wins" }),
        execGhAuthToken: () => Promise.resolve("gh_loses"),
        loadStoredToken: () => Promise.resolve("device_loses"),
      });
      expect((await resolver.resolve())?.source).toBe("env_GITHUB_TOKEN");
    });

    it("gh CLI beats device flow", async () => {
      const resolver = new GithubIdentityResolver({
        env: mkEnv({}),
        execGhAuthToken: () => Promise.resolve("gh_wins"),
        loadStoredToken: () => Promise.resolve("device_loses"),
      });
      expect((await resolver.resolve())?.source).toBe("gh_cli");
    });
  });
});
