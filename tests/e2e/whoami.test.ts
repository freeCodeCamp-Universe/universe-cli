import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { whoami } from "../../src/commands/whoami.js";
import { type FakeArtemis, startFakeArtemis } from "./_helpers/fake-artemis.js";
import { type CliEnv, makeCliEnv } from "./_helpers/cli-env.js";
import { runBinary } from "./_helpers/spawn-cli.js";

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

function captureStdout(): { read: () => string; restore: () => void } {
  const chunks: string[] = [];
  const spy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: unknown) => {
      chunks.push(String(chunk));
      return true;
    });
  return {
    read: () => chunks.join(""),
    restore: () => spy.mockRestore(),
  };
}

interface RunResult {
  captured: CapturedExit;
  envelope: Record<string, unknown> | undefined;
  logSuccess: ReturnType<typeof vi.fn>;
  logError: ReturnType<typeof vi.fn>;
}

async function runWhoamiJson(env: NodeJS.ProcessEnv): Promise<RunResult> {
  const stdout = captureStdout();
  const captured: CapturedExit = {};
  const logSuccess = vi.fn();
  const logError = vi.fn();
  try {
    await whoami(
      { json: true },
      { env, exit: makeExit(captured), logSuccess, logError },
    );
  } catch (err) {
    if (!(err instanceof Error) || !("__exit__" in err)) throw err;
  }
  stdout.restore();
  const raw = stdout.read().trim();
  const envelope =
    raw.length > 0 ? (JSON.parse(raw) as Record<string, unknown>) : undefined;
  return { captured, envelope, logSuccess, logError };
}

describe("whoami E2E (real proxy-client + real identity chain)", () => {
  let server: FakeArtemis;
  let env: CliEnv;

  beforeEach(async () => {
    server = await startFakeArtemis();
  });

  afterEach(async () => {
    await env?.cleanup();
    await server.close();
  });

  it("walks identity chain, hits real /api/whoami, emits success envelope", async () => {
    const token = "ghp_e2e_token";
    server.state.tokens.set(token, {
      login: "alice",
      authorizedSites: ["news", "certifications"],
    });
    env = await makeCliEnv({ proxyUrl: server.url, githubToken: token });

    const r = await runWhoamiJson(env.env);

    expect(r.captured.code).toBeUndefined();
    expect(r.logError).not.toHaveBeenCalled();
    expect(r.envelope).toBeDefined();
    expect(r.envelope!["command"]).toBe("whoami");
    expect(r.envelope!["success"]).toBe(true);
    expect(r.envelope!["login"]).toBe("alice");
    expect(r.envelope!["authorizedSitesCount"]).toBe(2);
    expect(r.envelope!["identitySource"]).toBe("env_GITHUB_TOKEN");
    expect(r.envelope!["authorizedSites"]).toBeUndefined();

    expect(server.callLog).toHaveLength(1);
    const call = server.callLog[0];
    expect(call.method).toBe("GET");
    expect(call.path).toBe("/api/whoami");
    expect(call.authorization).toBe(`Bearer ${token}`);
    expect(call.status).toBe(200);
  });

  it("exits EXIT_CREDENTIALS on 401 (token unknown to artemis)", async () => {
    server.state.tokens.set("ghp_known", {
      login: "alice",
      authorizedSites: [],
    });
    env = await makeCliEnv({ proxyUrl: server.url, githubToken: "ghp_wrong" });

    const r = await runWhoamiJson(env.env);

    expect(r.captured.code).toBe(12);
    expect(r.envelope).toBeDefined();
    expect(r.envelope!["success"]).toBe(false);
    const errorBlock = r.envelope!["error"] as {
      code: number;
      message: string;
    };
    expect(errorBlock.code).toBe(12);
    expect(errorBlock.message).toContain("unauth");
    expect(errorBlock.message).toContain("bad token");

    expect(server.callLog).toHaveLength(1);
    expect(server.callLog[0].status).toBe(401);
  });

  it("exits EXIT_CREDENTIALS on 403 (token recognized, no team)", async () => {
    server.state.failures.set("GET /api/whoami", {
      status: 403,
      code: "user_unauthorized",
      message: "no team membership",
    });
    env = await makeCliEnv({ proxyUrl: server.url, githubToken: "ghp_x" });

    const r = await runWhoamiJson(env.env);

    expect(r.captured.code).toBe(12);
    expect(r.envelope).toBeDefined();
    const errorBlock = r.envelope!["error"] as {
      code: number;
      message: string;
    };
    expect(errorBlock.code).toBe(12);
    expect(errorBlock.message).toContain("user_unauthorized");
    expect(errorBlock.message).toContain("no team membership");

    expect(server.callLog).toHaveLength(1);
    expect(server.callLog[0].status).toBe(403);
  });

  it("exits EXIT_STORAGE on network down (proxy unreachable)", async () => {
    env = await makeCliEnv({ proxyUrl: server.url, githubToken: "ghp_x" });
    await server.close();

    const r = await runWhoamiJson(env.env);

    expect(r.captured.code).toBe(13);
    expect(r.envelope).toBeDefined();
    const errorBlock = r.envelope!["error"] as {
      code: number;
      message: string;
    };
    expect(errorBlock.code).toBe(13);
    expect(errorBlock.message).toContain("network_error");
    expect(errorBlock.message).toContain("proxy unreachable");

    expect(server.callLog).toHaveLength(0);
  });
});

describe("whoami binary smoke (spawned dist/index.js)", () => {
  let server: FakeArtemis;
  let env: CliEnv;

  beforeEach(async () => {
    server = await startFakeArtemis();
  });

  afterEach(async () => {
    await env?.cleanup();
    await server.close();
  });

  it("boots dist binary, hits real /api/whoami, prints success envelope", async () => {
    const token = "ghp_smoke_token";
    server.state.tokens.set(token, {
      login: "alice",
      authorizedSites: ["news"],
    });
    env = await makeCliEnv({ proxyUrl: server.url, githubToken: token });

    const r = await runBinary(["whoami", "--json"], env.env);

    expect(r.exitCode).toBe(0);
    const envelope = JSON.parse(r.stdout.trim()) as Record<string, unknown>;
    expect(envelope["command"]).toBe("whoami");
    expect(envelope["success"]).toBe(true);
    expect(envelope["login"]).toBe("alice");
    expect(envelope["authorizedSitesCount"]).toBe(1);

    expect(server.callLog).toHaveLength(1);
    expect(server.callLog[0].path).toBe("/api/whoami");
    expect(server.callLog[0].authorization).toBe(`Bearer ${token}`);
  }, 120_000);
});
