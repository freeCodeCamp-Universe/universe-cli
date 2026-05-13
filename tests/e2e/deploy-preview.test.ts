import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deploy } from "../../src/commands/deploy.js";
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
  warns: string[];
}

async function runDeploy(
  env: NodeJS.ProcessEnv,
  cwd: string,
  options: { json: true; promote?: boolean },
): Promise<RunResult> {
  const chunks: string[] = [];
  const spy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: unknown) => {
      chunks.push(String(chunk));
      return true;
    });
  const captured: CapturedExit = {};
  const warns: string[] = [];
  try {
    await deploy(options, {
      cwd,
      env,
      exit: makeExit(captured),
      logSuccess: vi.fn(),
      logInfo: vi.fn(),
      logWarn: (m: string) => warns.push(m),
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
  return { captured, envelope, warns };
}

interface TextRunResult {
  captured: CapturedExit;
  successes: string[];
  warns: string[];
  errors: string[];
}

async function runDeployText(
  env: NodeJS.ProcessEnv,
  cwd: string,
  options: { promote?: boolean } = {},
): Promise<TextRunResult> {
  const captured: CapturedExit = {};
  const successes: string[] = [];
  const warns: string[] = [];
  const errors: string[] = [];
  try {
    await deploy(
      { json: false, ...options },
      {
        cwd,
        env,
        exit: makeExit(captured),
        logSuccess: (m: string) => successes.push(m),
        logInfo: vi.fn(),
        logWarn: (m: string) => warns.push(m),
        logError: (m: string) => errors.push(m),
        getGitState: () => ({ hash: "deadbeefcafe1234", dirty: false }),
      },
    );
  } catch (err) {
    if (!(err instanceof Error) || !("__exit__" in err)) throw err;
  }
  return { captured, successes, warns, errors };
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
    const full = join(distDir, path);
    const parent = full.slice(0, full.lastIndexOf("/"));
    await mkdir(parent, { recursive: true });
    await writeFile(full, body, "utf-8");
  }
  return {
    dir,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

describe("static deploy preview E2E (real proxy-client + real upload)", () => {
  let server: FakeArtemis;
  let env: CliEnv;
  const token = "ghp_e2e_dep_prev";
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

  it("init→upload→finalize flips preview alias and emits success envelope", async () => {
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
        "index.html": "<html><body>hello</body></html>",
        "main.js": "console.log('hi')",
        "styles.css": "body { color: red }",
      },
    });
    projects.push(project);

    const r = await runDeploy(env.env, project.dir, { json: true });

    expect(r.captured.code).toBeUndefined();
    expect(r.envelope!["command"]).toBe("deploy");
    expect(r.envelope!["success"]).toBe(true);
    expect(r.envelope!["site"]).toBe(site);
    expect(r.envelope!["mode"]).toBe("preview");
    expect(r.envelope!["fileCount"]).toBe(3);
    expect(r.envelope!["sha"]).toBe("deadbeefcafe1234");
    const deployId = r.envelope!["deployId"] as string;
    expect(deployId).toMatch(/^\d{8}-\d{6}-\S+$/);
    expect(r.envelope!["url"]).toBe(`https://${site}.preview.freecode.camp`);

    const deploy = server.state.deploys.get(deployId);
    expect(deploy).toBeDefined();
    expect(deploy!.site).toBe(site);
    expect(deploy!.finalized).toBe(true);
    expect(deploy!.mode).toBe("preview");
    expect(deploy!.uploadedFiles.size).toBe(3);
    expect(deploy!.uploadedFiles.get("index.html")).toBe(
      "<html><body>hello</body></html>",
    );
    expect(deploy!.uploadedFiles.get("main.js")).toBe("console.log('hi')");
    expect(deploy!.uploadedFiles.get("styles.css")).toBe("body { color: red }");

    expect(server.state.aliases.preview.get(site)).toBe(deployId);
    expect(server.state.aliases.production.has(site)).toBe(false);

    const calls = server.callLog.map((c) => `${c.method} ${c.path}`);
    expect(calls).toContain("GET /api/whoami");
    expect(calls).toContain("POST /api/deploy/init");
    expect(calls.filter((c) => c.startsWith("PUT /api/deploy/"))).toHaveLength(
      3,
    );
    expect(calls).toContain(`POST /api/deploy/${deployId}/finalize`);

    const finalizeCall = server.callLog.find(
      (c) => c.path === `/api/deploy/${deployId}/finalize`,
    )!;
    const finalizeBody = JSON.parse(finalizeCall.body) as {
      mode: string;
      files: string[];
    };
    expect(finalizeBody.mode).toBe("preview");
    expect(finalizeBody.files.sort()).toEqual([
      "index.html",
      "main.js",
      "styles.css",
    ]);
  });

  it("non-JSON success hint includes `--from <deployId>` after preview deploy", async () => {
    const site = "my-site-text";
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
      files: { "index.html": "<html></html>" },
    });
    projects.push(project);

    const r = await runDeployText(env.env, project.dir, {});

    expect(r.captured.code).toBeUndefined();
    expect(r.errors).toEqual([]);
    expect(r.successes).toHaveLength(1);
    const deployId = [...server.state.deploys.keys()][0];
    expect(deployId).toBeDefined();
    const out = r.successes[0];
    expect(out).toContain(`Deployed ${deployId}`);
    expect(out).toContain(`Next: universe static promote --from ${deployId}`);
  });
});
