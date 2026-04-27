import { describe, expect, it } from "vitest";
import { resolveIdentity } from "../../src/lib/identity.js";

function mkEnv(
  overrides: Record<string, string | undefined>,
): NodeJS.ProcessEnv {
  // Strip undefined keys to mimic a clean env.
  const out: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(overrides)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

describe("resolveIdentity — priority chain (ADR-016 Q10)", () => {
  it("returns null when no source matches", async () => {
    const r = await resolveIdentity({
      env: mkEnv({}),
      execGhAuthToken: async () => null,
      loadStoredToken: async () => null,
    });
    expect(r).toBeNull();
  });

  describe("slot 1 — env vars", () => {
    it("uses $GITHUB_TOKEN when set", async () => {
      const r = await resolveIdentity({
        env: mkEnv({ GITHUB_TOKEN: "ghp_env" }),
        execGhAuthToken: async () => "should_not_run",
        loadStoredToken: async () => "should_not_run",
      });
      expect(r).toEqual({ token: "ghp_env", source: "env_GITHUB_TOKEN" });
    });

    it("uses $GH_TOKEN when set and GITHUB_TOKEN absent", async () => {
      const r = await resolveIdentity({
        env: mkEnv({ GH_TOKEN: "ghp_gh" }),
        execGhAuthToken: async () => "should_not_run",
        loadStoredToken: async () => "should_not_run",
      });
      expect(r).toEqual({ token: "ghp_gh", source: "env_GH_TOKEN" });
    });

    it("prefers GITHUB_TOKEN over GH_TOKEN when both set", async () => {
      const r = await resolveIdentity({
        env: mkEnv({ GITHUB_TOKEN: "win", GH_TOKEN: "lose" }),
        execGhAuthToken: async () => null,
        loadStoredToken: async () => null,
      });
      expect(r?.token).toBe("win");
    });

    it("ignores empty env values and falls through", async () => {
      const r = await resolveIdentity({
        env: mkEnv({ GITHUB_TOKEN: "", GH_TOKEN: "" }),
        execGhAuthToken: async () => null,
        loadStoredToken: async () => "device",
      });
      expect(r?.source).toBe("device_flow");
    });
  });

  describe("GHA OIDC slot removed (F7)", () => {
    // Per F7 review, the GHA OIDC slot was retired: artemis validates
    // bearers via GitHub `GET /user`, which only accepts user-scoped
    // PATs / OAuth tokens — not OIDC ID tokens. CI users supply
    // `$GITHUB_TOKEN` explicitly. Removed slot must NOT short-circuit
    // when ACTIONS_ID_TOKEN_REQUEST_URL/_TOKEN are present.
    it("ignores ACTIONS_ID_TOKEN_REQUEST_* env, falls to gh CLI", async () => {
      const r = await resolveIdentity({
        env: mkEnv({
          ACTIONS_ID_TOKEN_REQUEST_URL: "https://gha.example/token",
          ACTIONS_ID_TOKEN_REQUEST_TOKEN: "gha_req",
        }),
        execGhAuthToken: async () => "ghcli",
        loadStoredToken: async () => "device_lose",
      });
      expect(r?.source).toBe("gh_cli");
      expect(r?.token).toBe("ghcli");
    });
  });

  describe("slot 2 — gh auth token shell-out", () => {
    it("uses gh auth token output when no env match", async () => {
      const r = await resolveIdentity({
        env: mkEnv({}),
        execGhAuthToken: async () => "gho_cli",
        loadStoredToken: async () => "should_not_run",
      });
      expect(r).toEqual({ token: "gho_cli", source: "gh_cli" });
    });

    it("trims whitespace from gh output", async () => {
      const r = await resolveIdentity({
        env: mkEnv({}),
        execGhAuthToken: async () => "  gho_trim  \n",
        loadStoredToken: async () => null,
      });
      expect(r?.token).toBe("gho_trim");
    });

    it("falls through when gh returns null (not installed)", async () => {
      const r = await resolveIdentity({
        env: mkEnv({}),
        execGhAuthToken: async () => null,
        loadStoredToken: async () => "stored",
      });
      expect(r?.source).toBe("device_flow");
    });

    it("falls through when gh returns empty string", async () => {
      const r = await resolveIdentity({
        env: mkEnv({}),
        execGhAuthToken: async () => "",
        loadStoredToken: async () => "stored",
      });
      expect(r?.source).toBe("device_flow");
    });
  });

  describe("slot 3 — device-flow stored token", () => {
    it("uses stored token as last resort", async () => {
      const r = await resolveIdentity({
        env: mkEnv({}),
        execGhAuthToken: async () => null,
        loadStoredToken: async () => "stored_tok",
      });
      expect(r).toEqual({ token: "stored_tok", source: "device_flow" });
    });
  });

  describe("priority order", () => {
    it("env beats gh CLI beats device flow", async () => {
      const r = await resolveIdentity({
        env: mkEnv({ GITHUB_TOKEN: "env_wins" }),
        execGhAuthToken: async () => "gh_loses",
        loadStoredToken: async () => "device_loses",
      });
      expect(r?.source).toBe("env_GITHUB_TOKEN");
    });

    it("gh CLI beats device flow", async () => {
      const r = await resolveIdentity({
        env: mkEnv({}),
        execGhAuthToken: async () => "gh_wins",
        loadStoredToken: async () => "device_loses",
      });
      expect(r?.source).toBe("gh_cli");
    });
  });
});
