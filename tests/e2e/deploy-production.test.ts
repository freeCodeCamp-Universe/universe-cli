import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deploy } from "../../src/commands/deploy.js";
import { type CliEnv, makeCliEnv } from "./_helpers/cli-env.js";
import { type FakeArtemis, startFakeArtemis } from "./_helpers/fake-artemis.js";

/**
 * Regression-detection trip-wire for the operator complaint
 * "sites are not updating" (AUDIT B1).
 *
 * `static deploy --promote` flips `mode: "production"` in the
 * /finalize POST body and does NOT call the standalone
 * /api/site/{site}/promote route. The CLI fully delegates the alias
 * write to artemis as a finalize side-effect. This test pins three
 * facts (SPEC §V10):
 *
 *   1. After the call, the production alias points at the new deployId.
 *   2. There is exactly one POST to /finalize with body
 *      `{mode: "production", files: [...]}`.
 *   3. There are zero hits to /api/site/{site}/promote.
 *
 * If T10 goes RED on first run the bug is in the CLI; the fix lands
 * as a separate `fix(deploy):` commit referencing B1 and turns this
 * test green. If T10 goes GREEN, diagnosis pivots to artemis or the
 * CDN per the B1 hypothesis tree in `AUDIT.md`.
 */

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

async function runDeploy(
  env: NodeJS.ProcessEnv,
  cwd: string,
  options: { json: true; promote: boolean },
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
    await deploy(options, {
      cwd,
      env,
      exit: makeExit(captured),
      logSuccess: vi.fn(),
      logInfo: vi.fn(),
      logWarn: vi.fn(),
      logError: vi.fn(),
      getGitState: () => ({ hash: "deadbeefcafe1234", dirty: false }),
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

async function makeProject(opts: {
  site: string;
  files: Record<string, string>;
}): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "universe-cli-e2e-deploy-"));
  await writeFile(join(dir, "platform.yaml"), `site: ${opts.site}\n`, "utf-8");
  const distDir = join(dir, "dist");
  await mkdir(distDir, { recursive: true });
  for (const [path, body] of Object.entries(opts.files)) {
    await writeFile(join(distDir, path), body, "utf-8");
  }
  return {
    dir,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

describe("static deploy --promote E2E (alpha trip-wire for B1)", () => {
  let server: FakeArtemis;
  let env: CliEnv;
  const token = "ghp_e2e_dep_prod";
  const projects: Array<{ cleanup: () => Promise<void> }> = [];

  beforeEach(async () => {
    server = await startFakeArtemis();
  });

  afterEach(async () => {
    await env?.cleanup();
    await server.close();
    while (projects.length > 0) {
      const p = projects.pop()!;
      await p.cleanup();
    }
  });

  it("--promote flips production alias, sends mode=production, never POSTs /promote", async () => {
    const site = "my-site";
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
    env = await makeCliEnv({ proxyUrl: server.url, githubToken: token });

    const project = await makeProject({
      site,
      files: {
        "index.html": "<html><body>v2</body></html>",
        "main.js": "console.log('v2')",
      },
    });
    projects.push(project);

    const r = await runDeploy(env.env, project.dir, {
      json: true,
      promote: true,
    });

    expect(r.captured.code).toBeUndefined();
    expect(r.envelope!["success"]).toBe(true);
    expect(r.envelope!["mode"]).toBe("production");
    expect(r.envelope!["site"]).toBe(site);
    const deployId = r.envelope!["deployId"] as string;
    expect(deployId).toMatch(/^\d{8}-\d{6}-[a-f0-9]+$/i);
    expect(r.envelope!["url"]).toBe(`https://${site}.freecode.camp`);

    expect(server.state.aliases.production.get(site)).toBe(deployId);
    expect(server.state.aliases.preview.has(site)).toBe(false);

    const finalizeCalls = server.callLog.filter(
      (c) =>
        c.method === "POST" && /\/api\/deploy\/[^/]+\/finalize$/.test(c.path),
    );
    expect(finalizeCalls).toHaveLength(1);
    const finalizeBody = JSON.parse(finalizeCalls[0].body) as {
      mode: string;
      files: string[];
    };
    expect(finalizeBody.mode).toBe("production");
    expect(finalizeBody.files.sort()).toEqual(["index.html", "main.js"]);

    const promoteCalls = server.callLog.filter((c) =>
      /\/api\/site\/[^/]+\/promote$/.test(c.path),
    );
    expect(promoteCalls).toHaveLength(0);
  });

  it("--promote without flag (preview default) leaves production alias untouched", async () => {
    const site = "my-site";
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
    server.state.aliases.production.set(site, "20251010-090000-old0000");

    env = await makeCliEnv({ proxyUrl: server.url, githubToken: token });
    const project = await makeProject({
      site,
      files: { "index.html": "<html>preview</html>" },
    });
    projects.push(project);

    const r = await runDeploy(env.env, project.dir, {
      json: true,
      promote: false,
    });

    expect(r.captured.code).toBeUndefined();
    expect(r.envelope!["mode"]).toBe("preview");
    expect(server.state.aliases.production.get(site)).toBe(
      "20251010-090000-old0000",
    );
    const newDeployId = r.envelope!["deployId"] as string;
    expect(server.state.aliases.preview.get(site)).toBe(newDeployId);
  });
});
