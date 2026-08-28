import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { register as sitesRegister } from "../../src/commands/sites/register.js";
import { release as sitesRelease } from "../../src/commands/sites/release.js";
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

async function capture(run: (deps: Record<string, unknown>) => Promise<void>): Promise<RunResult> {
  const chunks: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    chunks.push(String(chunk));
    return true;
  });
  const captured: CapturedExit = {};
  try {
    await run({ exit: makeExit(captured), logSuccess: vi.fn(), logError: vi.fn() });
  } catch (err) {
    if (!(err instanceof Error) || !("__exit__" in err)) throw err;
  }
  spy.mockRestore();
  const raw = chunks.join("").trim();
  const envelope = raw.length > 0 ? (JSON.parse(raw) as Record<string, unknown>) : undefined;
  return { captured, envelope };
}

function hold(server: FakeArtemis, slug: string): void {
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
    prevProduction: "20260101-090000-prod111",
    prevPreview: "",
    reservedUntil: "2026-05-15T12:00:00Z",
  });
}

describe("sites release E2E (real proxy-client + real identity chain)", () => {
  let server: FakeArtemis;
  let env: CliEnv;
  const token = "ghp_e2e_rel";

  beforeEach(async () => {
    server = await startFakeArtemis();
    server.state.tokens.set(token, { login: "alice", authorizedSites: [], approver: true });
  });

  afterEach(async () => {
    await env?.cleanup();
    await server.close();
  });

  it("frees the held name and reports how many objects were trashed", async () => {
    hold(server, "blog");
    server.state.deploysBySite.set("blog", [
      { deployId: "20260101-090000-prod111" },
      { deployId: "20260102-090000-prev222" },
    ]);
    env = await makeCliEnv({ proxyUrl: server.url, githubToken: token });

    const r = await capture((deps) =>
      sitesRelease({ json: true, slug: "blog", yes: true }, { env: env.env, ...deps }),
    );

    expect(r.captured.code).toBeUndefined();
    expect(r.envelope!["command"]).toBe("sites release");
    expect(r.envelope!["success"]).toBe(true);
    expect(r.envelope!["slug"]).toBe("blog");
    expect(r.envelope!["status"]).toBe("released");
    expect(r.envelope!["moved"]).toBe(2);

    expect(server.callLog).toHaveLength(1);
    expect(server.callLog[0].method).toBe("POST");
    expect(server.callLog[0].path).toBe("/api/site/blog/release");
  });

  it("frees the name for re-registration, which the hold had blocked", async () => {
    hold(server, "blog");
    env = await makeCliEnv({ proxyUrl: server.url, githubToken: token });

    const blocked = await capture((deps) =>
      sitesRegister({ json: true, slug: "blog" }, { env: env.env, ...deps }),
    );
    expect(blocked.captured.code).toBe(10);
    expect((blocked.envelope!["error"] as { message: string }).message).toContain("site_reserved");

    await capture((deps) =>
      sitesRelease({ json: true, slug: "blog", yes: true }, { env: env.env, ...deps }),
    );

    const allowed = await capture((deps) =>
      sitesRegister({ json: true, slug: "blog" }, { env: env.env, ...deps }),
    );
    expect(allowed.captured.code).toBeUndefined();
    expect(allowed.envelope!["slug"]).toBe("blog");
    expect(server.state.registry.get("blog")?.state).toBe("active");
  });

  it("exits EXIT_CREDENTIALS for a staff caller who is not an approver", async () => {
    server.state.tokens.set(token, { login: "alice", authorizedSites: [], approver: false });
    hold(server, "blog");
    env = await makeCliEnv({ proxyUrl: server.url, githubToken: token });

    const r = await capture((deps) =>
      sitesRelease({ json: true, slug: "blog", yes: true }, { env: env.env, ...deps }),
    );

    expect(r.captured.code).toBe(12);
    expect((r.envelope!["error"] as { message: string }).message).toContain("user_unauthorized");
    expect(server.state.registry.get("blog")?.state).toBe("reserved");
  });

  it("exits EXIT_USAGE on 404 for a name that is not held", async () => {
    env = await makeCliEnv({ proxyUrl: server.url, githubToken: token });

    const r = await capture((deps) =>
      sitesRelease({ json: true, slug: "never-held", yes: true }, { env: env.env, ...deps }),
    );

    expect(r.captured.code).toBe(10);
    const message = (r.envelope!["error"] as { message: string }).message;
    expect(message).toContain("not_found");
    expect(message).toContain("site is not a reserved name");
  });

  it("refuses --json without --yes and never reaches the wire", async () => {
    hold(server, "blog");
    env = await makeCliEnv({ proxyUrl: server.url, githubToken: token });

    const r = await capture((deps) =>
      sitesRelease({ json: true, slug: "blog", yes: false }, { env: env.env, ...deps }),
    );

    expect(r.captured.code).toBeGreaterThan(0);
    expect(server.callLog.filter((c) => c.path.endsWith("/release"))).toHaveLength(0);
    expect(server.state.registry.get("blog")?.state).toBe("reserved");
  });
});
