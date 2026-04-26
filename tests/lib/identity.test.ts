import { describe, expect, it, vi } from "vitest";
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
      fetch: vi.fn(),
    });
    expect(r).toBeNull();
  });

  describe("slot 1 — env vars", () => {
    it("uses $GITHUB_TOKEN when set", async () => {
      const r = await resolveIdentity({
        env: mkEnv({ GITHUB_TOKEN: "ghp_env" }),
        execGhAuthToken: async () => "should_not_run",
        loadStoredToken: async () => "should_not_run",
        fetch: vi.fn(),
      });
      expect(r).toEqual({ token: "ghp_env", source: "env_GITHUB_TOKEN" });
    });

    it("uses $GH_TOKEN when set and GITHUB_TOKEN absent", async () => {
      const r = await resolveIdentity({
        env: mkEnv({ GH_TOKEN: "ghp_gh" }),
        execGhAuthToken: async () => "should_not_run",
        loadStoredToken: async () => "should_not_run",
        fetch: vi.fn(),
      });
      expect(r).toEqual({ token: "ghp_gh", source: "env_GH_TOKEN" });
    });

    it("prefers GITHUB_TOKEN over GH_TOKEN when both set", async () => {
      const r = await resolveIdentity({
        env: mkEnv({ GITHUB_TOKEN: "win", GH_TOKEN: "lose" }),
        execGhAuthToken: async () => null,
        loadStoredToken: async () => null,
        fetch: vi.fn(),
      });
      expect(r?.token).toBe("win");
    });

    it("ignores empty env values and falls through", async () => {
      const r = await resolveIdentity({
        env: mkEnv({ GITHUB_TOKEN: "", GH_TOKEN: "" }),
        execGhAuthToken: async () => null,
        loadStoredToken: async () => "device",
        fetch: vi.fn(),
      });
      expect(r?.source).toBe("device_flow");
    });
  });

  describe("slot 2 — GHA OIDC", () => {
    it("fetches OIDC token from $ACTIONS_ID_TOKEN_REQUEST_URL", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ value: "oidc_jwt" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
      const r = await resolveIdentity({
        env: mkEnv({
          ACTIONS_ID_TOKEN_REQUEST_URL: "https://gha.example/token",
          ACTIONS_ID_TOKEN_REQUEST_TOKEN: "gha_req",
        }),
        execGhAuthToken: async () => null,
        loadStoredToken: async () => null,
        fetch: fetchMock,
      });
      expect(r).toEqual({ token: "oidc_jwt", source: "gha_oidc" });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("https://gha.example/token");
      expect(url).toContain("audience=artemis");
      const headers = init.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("Bearer gha_req");
    });

    it("respects custom audience option", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ value: "x" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
      await resolveIdentity({
        env: mkEnv({
          ACTIONS_ID_TOKEN_REQUEST_URL: "https://gha.example/token",
          ACTIONS_ID_TOKEN_REQUEST_TOKEN: "gha_req",
        }),
        execGhAuthToken: async () => null,
        loadStoredToken: async () => null,
        fetch: fetchMock,
        ghaAudience: "custom",
      });
      expect(fetchMock.mock.calls[0]?.[0]).toContain("audience=custom");
    });

    it("falls through when only one of the two env vars is set", async () => {
      const fetchMock = vi.fn();
      const r = await resolveIdentity({
        env: mkEnv({
          ACTIONS_ID_TOKEN_REQUEST_URL: "https://gha.example/token",
        }),
        execGhAuthToken: async () => "ghcli",
        loadStoredToken: async () => null,
        fetch: fetchMock,
      });
      expect(r?.source).toBe("gh_cli");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("falls through when OIDC fetch returns non-200", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response("nope", { status: 500 }));
      const r = await resolveIdentity({
        env: mkEnv({
          ACTIONS_ID_TOKEN_REQUEST_URL: "https://gha.example/token",
          ACTIONS_ID_TOKEN_REQUEST_TOKEN: "gha_req",
        }),
        execGhAuthToken: async () => "ghcli",
        loadStoredToken: async () => null,
        fetch: fetchMock,
      });
      expect(r?.source).toBe("gh_cli");
    });

    it("falls through when OIDC fetch throws", async () => {
      const fetchMock = vi.fn().mockRejectedValue(new TypeError("net"));
      const r = await resolveIdentity({
        env: mkEnv({
          ACTIONS_ID_TOKEN_REQUEST_URL: "https://gha.example/token",
          ACTIONS_ID_TOKEN_REQUEST_TOKEN: "gha_req",
        }),
        execGhAuthToken: async () => "ghcli",
        loadStoredToken: async () => null,
        fetch: fetchMock,
      });
      expect(r?.source).toBe("gh_cli");
    });
  });

  describe("slot 4 — gh auth token shell-out", () => {
    it("uses gh auth token output when no env match", async () => {
      const r = await resolveIdentity({
        env: mkEnv({}),
        execGhAuthToken: async () => "gho_cli",
        loadStoredToken: async () => "should_not_run",
        fetch: vi.fn(),
      });
      expect(r).toEqual({ token: "gho_cli", source: "gh_cli" });
    });

    it("trims whitespace from gh output", async () => {
      const r = await resolveIdentity({
        env: mkEnv({}),
        execGhAuthToken: async () => "  gho_trim  \n",
        loadStoredToken: async () => null,
        fetch: vi.fn(),
      });
      expect(r?.token).toBe("gho_trim");
    });

    it("falls through when gh returns null (not installed)", async () => {
      const r = await resolveIdentity({
        env: mkEnv({}),
        execGhAuthToken: async () => null,
        loadStoredToken: async () => "stored",
        fetch: vi.fn(),
      });
      expect(r?.source).toBe("device_flow");
    });

    it("falls through when gh returns empty string", async () => {
      const r = await resolveIdentity({
        env: mkEnv({}),
        execGhAuthToken: async () => "",
        loadStoredToken: async () => "stored",
        fetch: vi.fn(),
      });
      expect(r?.source).toBe("device_flow");
    });
  });

  describe("slot 5 — device-flow stored token", () => {
    it("uses stored token as last resort", async () => {
      const r = await resolveIdentity({
        env: mkEnv({}),
        execGhAuthToken: async () => null,
        loadStoredToken: async () => "stored_tok",
        fetch: vi.fn(),
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
        fetch: vi.fn(),
      });
      expect(r?.source).toBe("env_GITHUB_TOKEN");
    });

    it("GHA OIDC beats gh CLI beats device flow", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ value: "oidc_wins" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
      const r = await resolveIdentity({
        env: mkEnv({
          ACTIONS_ID_TOKEN_REQUEST_URL: "https://gha.example/token",
          ACTIONS_ID_TOKEN_REQUEST_TOKEN: "gha_req",
        }),
        execGhAuthToken: async () => "gh_loses",
        loadStoredToken: async () => "device_loses",
        fetch: fetchMock,
      });
      expect(r?.source).toBe("gha_oidc");
    });
  });
});
