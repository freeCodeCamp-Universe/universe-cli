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
  buildCalls: number;
}

async function runDeployWithBuildStub(
  env: NodeJS.ProcessEnv,
  cwd: string,
): Promise<RunResult> {
  const chunks: string[] = [];
  const spy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: unknown) => {
      chunks.push(String(chunk));
      return true;
    });
  const captured: CapturedExit = {};
  const buildStub = vi
    .fn()
    .mockResolvedValue({ skipped: true, outputDir: join(cwd, "dist") });
  try {
    await deploy(
      { json: true, promote: false },
      {
        cwd,
        env,
        exit: makeExit(captured),
        logSuccess: vi.fn(),
        logInfo: vi.fn(),
        logWarn: vi.fn(),
        logError: vi.fn(),
        getGitState: () => ({ hash: "deadbeefcafe1234", dirty: false }),
        runBuild: buildStub,
      },
    );
  } catch (err) {
    if (!(err instanceof Error) || !("__exit__" in err)) throw err;
  }
  spy.mockRestore();
  const raw = chunks.join("").trim();
  const envelope =
    raw.length > 0 ? (JSON.parse(raw) as Record<string, unknown>) : undefined;
  return { captured, envelope, buildCalls: buildStub.mock.calls.length };
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

describe("static deploy preflight E2E (build never runs on auth failure)", () => {
  let server: FakeArtemis;
  let env: CliEnv;
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

  it("whoami 401 → EXIT_CREDENTIALS, runBuild not called, no /api/deploy/* hits", async () => {
    env = await makeCliEnv({
      proxyUrl: server.url,
      githubToken: "ghp_unknown_to_artemis",
    });
    const project = await makeProject({
      site: "my-site",
      files: { "index.html": "<html></html>" },
    });
    projects.push(project);

    const r = await runDeployWithBuildStub(env.env, project.dir);

    expect(r.captured.code).toBe(12);
    const errorBlock = r.envelope!["error"] as {
      code: number;
      message: string;
    };
    expect(errorBlock.code).toBe(12);
    expect(errorBlock.message).toContain("whoami preflight failed");
    expect(errorBlock.message).toContain("unauth");

    expect(r.buildCalls).toBe(0);

    const deployCalls = server.callLog.filter((c) =>
      c.path.startsWith("/api/deploy/"),
    );
    expect(deployCalls).toHaveLength(0);

    expect(server.callLog.filter((c) => c.path === "/api/whoami")).toHaveLength(
      1,
    );
  });

  it("whoami 200 but site_unauthorized → EXIT_CREDENTIALS with rich body, build skipped", async () => {
    const token = "ghp_e2e_pf";
    server.state.tokens.set(token, {
      login: "alice",
      authorizedSites: ["other-site", "third-site"],
    });
    env = await makeCliEnv({ proxyUrl: server.url, githubToken: token });
    const project = await makeProject({
      site: "my-site",
      files: { "index.html": "<html></html>" },
    });
    projects.push(project);

    const r = await runDeployWithBuildStub(env.env, project.dir);

    expect(r.captured.code).toBe(12);
    const errorBlock = r.envelope!["error"] as {
      code: number;
      message: string;
    };
    expect(errorBlock.code).toBe(12);
    expect(errorBlock.message).toContain("'my-site' is not registered");
    expect(errorBlock.message).toContain("alice");
    expect(errorBlock.message).toContain("Likely causes");

    expect(r.buildCalls).toBe(0);

    const deployCalls = server.callLog.filter((c) =>
      c.path.startsWith("/api/deploy/"),
    );
    expect(deployCalls).toHaveLength(0);
  });
});
