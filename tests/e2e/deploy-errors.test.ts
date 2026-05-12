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

describe("static deploy error paths E2E", () => {
  let server: FakeArtemis;
  let env: CliEnv;
  const token = "ghp_e2e_dep_err";
  const projects: Array<{ cleanup: () => Promise<void> }> = [];

  beforeEach(async () => {
    server = await startFakeArtemis();
    server.state.tokens.set(token, {
      login: "alice",
      authorizedSites: ["my-site"],
    });
    server.state.registry.set("my-site", {
      slug: "my-site",
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

  it("exits EXIT_PARTIAL when one upload fails (finalize never runs)", async () => {
    server.state.uploadFailPaths.set("main.js", {
      status: 500,
      code: "r2_put_failed",
      message: "upstream r2 write timed out",
    });
    env = await makeCliEnv({ proxyUrl: server.url, githubToken: token });
    const project = await makeProject({
      site: "my-site",
      files: {
        "index.html": "<html></html>",
        "main.js": "console.log('hi')",
        "styles.css": "body{}",
      },
    });
    projects.push(project);

    const r = await runDeploy(env.env, project.dir, { json: true });

    expect(r.captured.code).toBe(19);
    const errorBlock = r.envelope!["error"] as {
      code: number;
      message: string;
    };
    expect(errorBlock.code).toBe(19);
    expect(errorBlock.message).toContain("Upload partially failed");
    expect(errorBlock.message).toContain("main.js");

    const finalizeCalls = server.callLog.filter(
      (c) => c.method === "POST" && /\/finalize$/.test(c.path),
    );
    expect(finalizeCalls).toHaveLength(0);

    expect(server.state.aliases.preview.has("my-site")).toBe(false);
    expect(server.state.aliases.production.has("my-site")).toBe(false);
  });

  it("exits EXIT_STORAGE on 422 verify_failed (alias not flipped)", async () => {
    server.state.finalizeFailure = {
      status: 422,
      code: "verify_failed",
      message: "deploy is missing expected files",
    };
    env = await makeCliEnv({ proxyUrl: server.url, githubToken: token });
    const project = await makeProject({
      site: "my-site",
      files: { "index.html": "<html></html>" },
    });
    projects.push(project);

    const r = await runDeploy(env.env, project.dir, { json: true });

    expect(r.captured.code).toBe(13);
    const errorBlock = r.envelope!["error"] as {
      code: number;
      message: string;
    };
    expect(errorBlock.code).toBe(13);
    expect(errorBlock.message).toContain("verify_failed");
    expect(errorBlock.message).toContain("missing expected files");

    expect(server.state.aliases.preview.has("my-site")).toBe(false);
    expect(server.state.aliases.production.has("my-site")).toBe(false);
  });
});
