import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { register } from "../../src/commands/sites/register.js";
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

async function runRegister(
  env: NodeJS.ProcessEnv,
  options: { json: true; slug: string; team?: string | string[] },
): Promise<RunResult> {
  const chunks: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    chunks.push(String(chunk));
    return true;
  });
  const captured: CapturedExit = {};
  try {
    await register(options, {
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
  const envelope = raw.length > 0 ? (JSON.parse(raw) as Record<string, unknown>) : undefined;
  return { captured, envelope };
}

describe("sites register E2E (real proxy-client + real identity chain)", () => {
  let server: FakeArtemis;
  let env: CliEnv;
  const token = "ghp_e2e_reg";

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

  it("registers a slug with the default team when --team is omitted", async () => {
    env = await makeCliEnv({ proxyUrl: server.url, githubToken: token });

    const r = await runRegister(env.env, { json: true, slug: "blog" });

    expect(r.captured.code).toBeUndefined();
    expect(r.envelope!["command"]).toBe("sites register");
    expect(r.envelope!["success"]).toBe(true);
    expect(r.envelope!["slug"]).toBe("blog");
    expect(r.envelope!["teams"]).toEqual(["staff"]);
    expect(r.envelope!["createdBy"]).toBe("alice");

    expect(server.state.registry.has("blog")).toBe(true);
    expect(server.state.registry.get("blog")!.teams).toEqual(["staff"]);

    expect(server.callLog).toHaveLength(1);
    const call = server.callLog[0];
    expect(call.method).toBe("POST");
    expect(call.path).toBe("/api/site/register");
    expect(call.status).toBe(201);
    expect(JSON.parse(call.body)).toEqual({ slug: "blog" });
  });

  it("serializes single-string, array, and comma-list --team into identical body", async () => {
    const variants: Array<string | string[]> = [["staff", "news-editors"], "staff,news-editors"];
    const bodies: unknown[] = [];

    for (const variant of variants) {
      const slug = `site-${bodies.length}`;
      env = await makeCliEnv({ proxyUrl: server.url, githubToken: token });
      const r = await runRegister(env.env, {
        json: true,
        slug,
        team: variant,
      });
      expect(r.captured.code).toBeUndefined();
      const lastCall = server.callLog[server.callLog.length - 1];
      bodies.push(JSON.parse(lastCall.body));
      await env.cleanup();
    }

    expect(bodies[0]).toEqual({
      slug: "site-0",
      teams: ["staff", "news-editors"],
    });
    expect(bodies[1]).toEqual({
      slug: "site-1",
      teams: ["staff", "news-editors"],
    });
    const teamsField = (b: unknown): string[] => (b as { teams: string[] }).teams;
    expect(teamsField(bodies[0])).toEqual(teamsField(bodies[1]));

    env = await makeCliEnv({ proxyUrl: server.url, githubToken: token });
    const single = await runRegister(env.env, {
      json: true,
      slug: "site-single",
      team: "staff",
    });
    expect(single.captured.code).toBeUndefined();
    const singleBody = JSON.parse(server.callLog[server.callLog.length - 1].body);
    expect(singleBody).toEqual({ slug: "site-single", teams: ["staff"] });
  });

  it("exits EXIT_USAGE on 409 already_exists", async () => {
    server.state.registry.set("blog", {
      slug: "blog",
      teams: ["staff"],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      createdBy: "bob",
    });
    env = await makeCliEnv({ proxyUrl: server.url, githubToken: token });

    const r = await runRegister(env.env, { json: true, slug: "blog" });

    expect(r.captured.code).toBe(10);
    const errorBlock = r.envelope!["error"] as {
      code: number;
      message: string;
    };
    expect(errorBlock.code).toBe(10);
    expect(errorBlock.message).toContain("already_exists");
    expect(errorBlock.message).toContain("blog");
  });

  it("exits EXIT_CREDENTIALS on 403 user_unauthorized", async () => {
    server.state.failures.set("POST /api/site/register", {
      status: 403,
      code: "user_unauthorized",
      message: "not staff",
    });
    env = await makeCliEnv({ proxyUrl: server.url, githubToken: token });

    const r = await runRegister(env.env, { json: true, slug: "blog" });

    expect(r.captured.code).toBe(12);
    const errorBlock = r.envelope!["error"] as {
      code: number;
      message: string;
    };
    expect(errorBlock.code).toBe(12);
    expect(errorBlock.message).toContain("user_unauthorized");
    expect(errorBlock.message).toContain("not staff");

    expect(server.state.registry.has("blog")).toBe(false);
  });
});
