import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rm as sitesRm } from "../../src/commands/sites/rm.js";
import { type CliEnv, makeCliEnv } from "./_helpers/cli-env.js";
import { type FakeArtemis, startFakeArtemis } from "./_helpers/fake-artemis.js";

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

async function runRm(
  env: NodeJS.ProcessEnv,
  options: { json: true; slug: string },
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
    await sitesRm(options, {
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

describe("sites rm E2E (real proxy-client + real identity chain)", () => {
  let server: FakeArtemis;
  let env: CliEnv;
  const token = "ghp_e2e_rm";

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

  it("deletes the registered slug and emits success envelope", async () => {
    server.state.registry.set("blog", {
      slug: "blog",
      teams: ["staff"],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      createdBy: "bob",
    });
    env = await makeCliEnv({ proxyUrl: server.url, githubToken: token });

    const r = await runRm(env.env, { json: true, slug: "blog" });

    expect(r.captured.code).toBeUndefined();
    expect(r.envelope!["command"]).toBe("sites rm");
    expect(r.envelope!["success"]).toBe(true);
    expect(r.envelope!["slug"]).toBe("blog");
    expect(r.envelope!["deleted"]).toBe(true);

    expect(server.state.registry.has("blog")).toBe(false);

    expect(server.callLog).toHaveLength(1);
    const call = server.callLog[0];
    expect(call.method).toBe("DELETE");
    expect(call.path).toBe("/api/site/blog");
    expect(call.status).toBe(204);
  });

  it("exits EXIT_USAGE on 404 not_registered", async () => {
    env = await makeCliEnv({ proxyUrl: server.url, githubToken: token });

    const r = await runRm(env.env, { json: true, slug: "ghost" });

    expect(r.captured.code).toBe(10);
    const errorBlock = r.envelope!["error"] as {
      code: number;
      message: string;
    };
    expect(errorBlock.code).toBe(10);
    expect(errorBlock.message).toContain("not_found");
    expect(errorBlock.message).toContain("ghost");

    expect(server.callLog).toHaveLength(1);
    expect(server.callLog[0].status).toBe(404);
  });

  it("exits EXIT_CREDENTIALS on 403 user_unauthorized", async () => {
    server.state.registry.set("blog", {
      slug: "blog",
      teams: ["staff"],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      createdBy: "bob",
    });
    server.state.failures.set("DELETE /api/site/blog", {
      status: 403,
      code: "user_unauthorized",
      message: "not staff",
    });
    env = await makeCliEnv({ proxyUrl: server.url, githubToken: token });

    const r = await runRm(env.env, { json: true, slug: "blog" });

    expect(r.captured.code).toBe(12);
    const errorBlock = r.envelope!["error"] as {
      code: number;
      message: string;
    };
    expect(errorBlock.code).toBe(12);
    expect(errorBlock.message).toContain("user_unauthorized");

    expect(server.state.registry.has("blog")).toBe(true);
  });
});
