import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ls as sitesLs } from "../../src/commands/sites/ls.js";
import { type CliEnv, makeCliEnv } from "./_helpers/cli-env.js";
import {
  type FakeArtemis,
  type SiteRow,
  startFakeArtemis,
} from "./_helpers/fake-artemis.js";

interface CapturedExit {
  code?: number;
}

interface ExitCalled extends Error {
  __exit__: true;
}

function makeExit(captured: CapturedExit): (code: number) => never {
  return (code: number) => {
    captured.code = code;
    const err = new Error("__exit__") as ExitCalled;
    err.__exit__ = true;
    throw err;
  };
}

interface RunResult {
  captured: CapturedExit;
  envelope: Record<string, unknown> | undefined;
}

async function runSitesLs(
  env: NodeJS.ProcessEnv,
  options: { json: true; mine?: boolean },
): Promise<RunResult> {
  const chunks: string[] = [];
  const spy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: unknown) => {
      chunks.push(String(chunk));
      return true;
    });
  const captured: CapturedExit = {};
  try {
    await sitesLs(options, {
      env,
      exit: makeExit(captured),
      logSuccess: vi.fn(),
      logError: vi.fn(),
    });
  } catch (err) {
    if (!(err instanceof Error) || !("__exit__" in err)) throw err;
  }
  spy.mockRestore();
  const raw = chunks.join("").trim();
  const envelope =
    raw.length > 0 ? (JSON.parse(raw) as Record<string, unknown>) : undefined;
  return { captured, envelope };
}

function row(slug: string, teams = ["staff"]): SiteRow {
  return {
    slug,
    teams,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    createdBy: "alice",
  };
}

describe("sites ls E2E (real proxy-client + real identity chain)", () => {
  let server: FakeArtemis;
  let env: CliEnv;
  const token = "ghp_e2e_sls";

  beforeEach(async () => {
    server = await startFakeArtemis();
    server.state.tokens.set(token, {
      login: "alice",
      authorizedSites: [],
    });
  });

  afterEach(async () => {
    await env?.cleanup();
    await server.close();
  });

  it("returns full registry list (scope=all) when --mine is not set", async () => {
    server.state.registry.set("alpha", row("alpha"));
    server.state.registry.set("bravo", row("bravo", ["news-editors"]));
    server.state.registry.set("charlie", row("charlie"));
    env = await makeCliEnv({ proxyUrl: server.url, githubToken: token });

    const r = await runSitesLs(env.env, { json: true });

    expect(r.captured.code).toBeUndefined();
    expect(r.envelope!["command"]).toBe("sites ls");
    expect(r.envelope!["success"]).toBe(true);
    expect(r.envelope!["scope"]).toBe("all");
    expect(r.envelope!["count"]).toBe(3);
    const sites = r.envelope!["sites"] as SiteRow[];
    expect(sites.map((s) => s.slug).sort()).toEqual([
      "alpha",
      "bravo",
      "charlie",
    ]);

    expect(server.callLog).toHaveLength(1);
    expect(server.callLog[0].path).toBe("/api/sites");
  });

  it("--mine intersects registry with caller's authorizedSites", async () => {
    server.state.tokens.set(token, {
      login: "alice",
      authorizedSites: ["alpha", "charlie"],
    });
    server.state.registry.set("alpha", row("alpha"));
    server.state.registry.set("bravo", row("bravo"));
    server.state.registry.set("charlie", row("charlie"));
    env = await makeCliEnv({ proxyUrl: server.url, githubToken: token });

    const r = await runSitesLs(env.env, { json: true, mine: true });

    expect(r.captured.code).toBeUndefined();
    expect(r.envelope!["scope"]).toBe("mine");
    expect(r.envelope!["count"]).toBe(2);
    const sites = r.envelope!["sites"] as SiteRow[];
    expect(sites.map((s) => s.slug).sort()).toEqual(["alpha", "charlie"]);

    expect(server.callLog).toHaveLength(2);
    const paths = server.callLog.map((c) => c.path).sort();
    expect(paths).toEqual(["/api/sites", "/api/whoami"]);
  });

  it("emits empty sites array when registry is empty", async () => {
    env = await makeCliEnv({ proxyUrl: server.url, githubToken: token });

    const r = await runSitesLs(env.env, { json: true });

    expect(r.captured.code).toBeUndefined();
    expect(r.envelope!["count"]).toBe(0);
    expect(r.envelope!["sites"]).toEqual([]);
  });

  it("exits EXIT_STORAGE on 502 registry_read_failed", async () => {
    server.state.failures.set("GET /api/sites", {
      status: 502,
      code: "registry_read_failed",
      message: "valkey down",
    });
    env = await makeCliEnv({ proxyUrl: server.url, githubToken: token });

    const r = await runSitesLs(env.env, { json: true });

    expect(r.captured.code).toBe(13);
    const errorBlock = r.envelope!["error"] as {
      code: number;
      message: string;
    };
    expect(errorBlock.code).toBe(13);
    expect(errorBlock.message).toContain("registry_read_failed");
    expect(errorBlock.message).toContain("valkey down");
  });
});
