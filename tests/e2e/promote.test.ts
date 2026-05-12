import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promote } from "../../src/commands/promote.js";
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

async function runPromote(
  env: NodeJS.ProcessEnv,
  cwd: string,
  options: { json: true; from?: string },
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
    await promote(options, {
      cwd,
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

async function makeProject(
  site: string,
): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "universe-cli-e2e-promote-"));
  await writeFile(join(dir, "platform.yaml"), `site: ${site}\n`, "utf-8");
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

describe("static promote E2E", () => {
  let server: FakeArtemis;
  let env: CliEnv;
  const token = "ghp_e2e_promote";
  const site = "my-site";
  const projects: Array<{ cleanup: () => Promise<void> }> = [];

  beforeEach(async () => {
    server = await startFakeArtemis();
    server.state.tokens.set(token, {
      login: "alice",
      authorizedSites: [site],
    });
    server.state.registry.set(site, {
      slug: site,
      teams: ["staff"],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      createdBy: "alice",
    });
  });

  afterEach(async () => {
    await env?.cleanup();
    await server.close();
    while (projects.length > 0) {
      const p = projects.pop()!;
      await p.cleanup();
    }
  });

  it("promote (no --from) flips production alias to current preview deployId", async () => {
    const previewId = "20260301-091500-aaa1111";
    server.state.aliases.preview.set(site, previewId);
    env = await makeCliEnv({ proxyUrl: server.url, githubToken: token });
    const project = await makeProject(site);
    projects.push(project);

    const r = await runPromote(env.env, project.dir, { json: true });

    expect(r.captured.code).toBeUndefined();
    expect(r.envelope!["command"]).toBe("promote");
    expect(r.envelope!["success"]).toBe(true);
    expect(r.envelope!["deployId"]).toBe(previewId);
    expect(r.envelope!["site"]).toBe(site);

    expect(server.state.aliases.production.get(site)).toBe(previewId);

    expect(server.callLog).toHaveLength(1);
    expect(server.callLog[0].method).toBe("POST");
    expect(server.callLog[0].path).toBe(`/api/site/${site}/promote`);
  });

  it("promote --from <deployId> calls rollback (alias rewrite to explicit id)", async () => {
    const targetId = "20251010-090000-bbb2222";
    server.state.deploysBySite.set(site, [{ deployId: targetId }]);
    env = await makeCliEnv({ proxyUrl: server.url, githubToken: token });
    const project = await makeProject(site);
    projects.push(project);

    const r = await runPromote(env.env, project.dir, {
      json: true,
      from: targetId,
    });

    expect(r.captured.code).toBeUndefined();
    expect(r.envelope!["deployId"]).toBe(targetId);

    expect(server.state.aliases.production.get(site)).toBe(targetId);

    expect(server.callLog).toHaveLength(1);
    expect(server.callLog[0].method).toBe("POST");
    expect(server.callLog[0].path).toBe(`/api/site/${site}/rollback`);
    expect(JSON.parse(server.callLog[0].body)).toEqual({ to: targetId });
  });

  it("promote --from unknown id exits EXIT_USAGE on 404", async () => {
    env = await makeCliEnv({ proxyUrl: server.url, githubToken: token });
    const project = await makeProject(site);
    projects.push(project);

    const r = await runPromote(env.env, project.dir, {
      json: true,
      from: "20251010-090000-ghost00",
    });

    expect(r.captured.code).toBe(10);
    const errorBlock = r.envelope!["error"] as {
      code: number;
      message: string;
    };
    expect(errorBlock.code).toBe(10);
    expect(errorBlock.message).toContain("not_found");

    expect(server.state.aliases.production.has(site)).toBe(false);
  });
});
