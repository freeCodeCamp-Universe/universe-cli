import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { undelete as sitesUndelete } from "../../src/commands/sites/undelete.js";
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

async function runUndelete(env: NodeJS.ProcessEnv, slug: string): Promise<RunResult> {
  const chunks: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    chunks.push(String(chunk));
    return true;
  });
  const captured: CapturedExit = {};
  try {
    await sitesUndelete(
      { json: true, slug },
      { env, exit: makeExit(captured), logSuccess: vi.fn(), logError: vi.fn() },
    );
  } catch (err) {
    if (!(err instanceof Error) || !("__exit__" in err)) throw err;
  }
  spy.mockRestore();
  const raw = chunks.join("").trim();
  const envelope = raw.length > 0 ? (JSON.parse(raw) as Record<string, unknown>) : undefined;
  return { captured, envelope };
}

function hold(server: FakeArtemis, slug: string, production: string, preview: string): void {
  server.state.registry.set(slug, {
    slug,
    teams: ["staff"],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    createdBy: "bob",
    state: "reserved",
    reservedUntil: "2026-05-15T12:00:00Z",
  });
  server.state.reservations.set(slug, {
    prevProduction: production,
    prevPreview: preview,
    reservedUntil: "2026-05-15T12:00:00Z",
  });
}

describe("sites undelete E2E (real proxy-client + real identity chain)", () => {
  let server: FakeArtemis;
  let env: CliEnv;
  const token = "ghp_e2e_undel";

  beforeEach(async () => {
    server = await startFakeArtemis();
    server.state.tokens.set(token, { login: "alice", authorizedSites: [] });
  });

  afterEach(async () => {
    await env?.cleanup();
    await server.close();
  });

  it("returns the held name to service and reports both alias pointers", async () => {
    hold(server, "blog", "20260101-090000-prod111", "20260102-090000-prev222");
    env = await makeCliEnv({ proxyUrl: server.url, githubToken: token });

    const r = await runUndelete(env.env, "blog");

    expect(r.captured.code).toBeUndefined();
    expect(r.envelope!["command"]).toBe("sites undelete");
    expect(r.envelope!["success"]).toBe(true);
    expect(r.envelope!["slug"]).toBe("blog");
    expect(r.envelope!["prevProduction"]).toBe("20260101-090000-prod111");
    expect(r.envelope!["prevPreview"]).toBe("20260102-090000-prev222");

    expect(server.callLog).toHaveLength(1);
    expect(server.callLog[0].method).toBe("POST");
    expect(server.callLog[0].path).toBe("/api/site/blog/undelete");
    expect(server.callLog[0].status).toBe(200);
  });

  it("restores the alias pointers server-side, so the site serves again", async () => {
    hold(server, "blog", "20260101-090000-prod111", "20260102-090000-prev222");
    env = await makeCliEnv({ proxyUrl: server.url, githubToken: token });

    await runUndelete(env.env, "blog");

    expect(server.state.registry.get("blog")?.state).toBe("active");
    expect(server.state.registry.get("blog")?.reservedUntil).toBeUndefined();
    expect(server.state.reservations.has("blog")).toBe(false);
    expect(server.state.aliases.production.get("blog")).toBe("20260101-090000-prod111");
    expect(server.state.aliases.preview.get("blog")).toBe("20260102-090000-prev222");
  });

  it("reports an empty pointer for a site deleted before it ever served", async () => {
    hold(server, "blog", "", "");
    env = await makeCliEnv({ proxyUrl: server.url, githubToken: token });

    const r = await runUndelete(env.env, "blog");

    expect(r.captured.code).toBeUndefined();
    expect(r.envelope!["prevProduction"]).toBe("");
    expect(r.envelope!["prevPreview"]).toBe("");
    expect(server.state.aliases.production.has("blog")).toBe(false);
  });

  it("exits EXIT_USAGE on 404 and points at the held list, not at a version floor", async () => {
    env = await makeCliEnv({ proxyUrl: server.url, githubToken: token });

    const r = await runUndelete(env.env, "never-held");

    expect(r.captured.code).toBe(10);
    const errorBlock = r.envelope!["error"] as { code: number; message: string };
    expect(errorBlock.code).toBe(10);
    expect(errorBlock.message).toContain("not_found");
    expect(errorBlock.message).toContain("site is not registered");
    expect(errorBlock.message).not.toContain("site is not a reserved name");
    expect(errorBlock.message).toContain("universe sites list --held");
    expect(errorBlock.message).not.toContain("1.10.0");
  });

  it("exits EXIT_USAGE on a slug artemis will not accept", async () => {
    env = await makeCliEnv({ proxyUrl: server.url, githubToken: token });

    const r = await runUndelete(env.env, "9-leading-digit");

    expect(r.captured.code).toBe(10);
    expect((r.envelope!["error"] as { message: string }).message).toContain("invalid_slug");
  });

  it("exits EXIT_USAGE on an active site, which is not a reserved name", async () => {
    server.state.registry.set("blog", {
      slug: "blog",
      teams: ["staff"],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      createdBy: "bob",
      state: "active",
    });
    env = await makeCliEnv({ proxyUrl: server.url, githubToken: token });

    const r = await runUndelete(env.env, "blog");

    expect(r.captured.code).toBe(10);
    expect(server.state.registry.get("blog")?.state).toBe("active");
  });
});
