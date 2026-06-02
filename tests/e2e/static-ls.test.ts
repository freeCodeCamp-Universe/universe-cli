import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ls } from "../../src/commands/ls.js";
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
  logSuccess: ReturnType<typeof vi.fn>;
  logError: ReturnType<typeof vi.fn>;
  logInfo: ReturnType<typeof vi.fn>;
}

async function runLsJson(
  env: NodeJS.ProcessEnv,
  options: { json: true; site?: string },
  cwd?: string,
): Promise<RunResult> {
  const chunks: string[] = [];
  const spy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: unknown) => {
      chunks.push(String(chunk));
      return true;
    });
  const captured: CapturedExit = {};
  const logSuccess = vi.fn();
  const logError = vi.fn();
  const logInfo = vi.fn();
  try {
    await ls(options, {
      cwd: cwd ?? process.cwd(),
      env,
      exit: makeExit(captured),
      logSuccess,
      logError,
      logInfo,
    });
  } catch (err) {
    if (!(err instanceof Error) || !("__exit__" in err)) throw err;
  }
  spy.mockRestore();
  const raw = chunks.join("").trim();
  const envelope =
    raw.length > 0 ? (JSON.parse(raw) as Record<string, unknown>) : undefined;
  return { captured, envelope, logSuccess, logError, logInfo };
}

function siteRow(slug: string): {
  slug: string;
  teams: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
} {
  return {
    slug,
    teams: ["staff"],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    createdBy: "alice",
  };
}

describe("static ls E2E (real proxy-client + real identity chain)", () => {
  let server: FakeArtemis;
  let env: CliEnv;
  const token = "ghp_e2e_ls";
  const projectDirs: string[] = [];

  beforeEach(async () => {
    server = await startFakeArtemis();
  });

  afterEach(async () => {
    await env?.cleanup();
    await server.close();
    while (projectDirs.length > 0) {
      const dir = projectDirs.pop()!;
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns deploy list when site is registered and authorized", async () => {
    server.state.tokens.set(token, {
      login: "alice",
      authorizedSites: ["my-site"],
    });
    server.state.registry.set("my-site", siteRow("my-site"));
    // Seed in ascending order (artemis-default) so the CLI's defensive
    // sort to newest-first is observable in the envelope output.
    server.state.deploysBySite.set("my-site", [
      { deployId: "20260227-080000-aaa1111" },
      { deployId: "20260228-120000-def5678" },
      { deployId: "20260301-091500-abc1234" },
    ]);
    server.state.aliases.preview.set("my-site", "20260301-091500-abc1234");
    server.state.aliases.production.set("my-site", "20260228-120000-def5678");
    env = await makeCliEnv({ proxyUrl: server.url, githubToken: token });

    const r = await runLsJson(env.env, { json: true, site: "my-site" });

    expect(r.captured.code).toBeUndefined();
    expect(r.envelope!["command"]).toBe("ls");
    expect(r.envelope!["success"]).toBe(true);
    expect(r.envelope!["site"]).toBe("my-site");
    const deploys = r.envelope!["deploys"] as Array<Record<string, unknown>>;
    expect(deploys).toHaveLength(3);
    expect(deploys.map((d) => d.deployId)).toEqual([
      "20260301-091500-abc1234",
      "20260228-120000-def5678",
      "20260227-080000-aaa1111",
    ]);
    expect(deploys[0].timestamp).toBe("2026-03-01T09:15:00Z");
    expect(deploys[0].sha).toBe("abc1234");
    expect(deploys[0].state).toBe("preview");
    expect(deploys[1].state).toBe("production");
    expect(deploys[2].state).toBeNull();
    expect(r.envelope!["aliases"]).toEqual({
      preview: "20260301-091500-abc1234",
      production: "20260228-120000-def5678",
    });

    const paths = server.callLog.map((c) => c.path).sort();
    expect(paths).toEqual([
      "/api/site/my-site/alias/preview",
      "/api/site/my-site/alias/production",
      "/api/site/my-site/deploys",
    ]);
  });

  it("emits empty deploys array when site has no deploys", async () => {
    server.state.tokens.set(token, {
      login: "alice",
      authorizedSites: ["my-site"],
    });
    server.state.registry.set("my-site", siteRow("my-site"));
    env = await makeCliEnv({ proxyUrl: server.url, githubToken: token });

    const r = await runLsJson(env.env, { json: true, site: "my-site" });

    expect(r.captured.code).toBeUndefined();
    expect(r.envelope!["success"]).toBe(true);
    expect(r.envelope!["deploys"]).toEqual([]);
  });

  it("exits EXIT_USAGE on 404 (site not registered)", async () => {
    server.state.tokens.set(token, {
      login: "alice",
      authorizedSites: [],
    });
    env = await makeCliEnv({ proxyUrl: server.url, githubToken: token });

    const r = await runLsJson(env.env, { json: true, site: "ghost" });

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

  it("exits EXIT_CREDENTIALS on 403 (registered but not authorized)", async () => {
    server.state.tokens.set(token, {
      login: "alice",
      authorizedSites: ["other-site"],
    });
    server.state.registry.set("locked", siteRow("locked"));
    env = await makeCliEnv({ proxyUrl: server.url, githubToken: token });

    const r = await runLsJson(env.env, { json: true, site: "locked" });

    expect(r.captured.code).toBe(12);
    const errorBlock = r.envelope!["error"] as {
      code: number;
      message: string;
    };
    expect(errorBlock.code).toBe(12);
    expect(errorBlock.message).toContain("site_unauthorized");

    expect(server.callLog).toHaveLength(1);
    expect(server.callLog[0].status).toBe(403);
  });

  it("--site flag overrides platform.yaml site value", async () => {
    server.state.tokens.set(token, {
      login: "alice",
      authorizedSites: ["from-flag"],
    });
    server.state.registry.set("from-flag", siteRow("from-flag"));
    server.state.deploysBySite.set("from-flag", [
      { deployId: "20260301-091500-fff0000" },
    ]);
    env = await makeCliEnv({ proxyUrl: server.url, githubToken: token });

    const projectDir = await mkdtemp(join(tmpdir(), "universe-cli-e2e-proj-"));
    projectDirs.push(projectDir);
    await writeFile(
      join(projectDir, "platform.yaml"),
      "site: from-yaml\nbuild:\n  output: dist\n",
      "utf-8",
    );

    const r = await runLsJson(
      env.env,
      { json: true, site: "from-flag" },
      projectDir,
    );

    expect(r.captured.code).toBeUndefined();
    expect(r.envelope!["site"]).toBe("from-flag");
    expect(server.callLog).toHaveLength(3);
    expect(server.callLog.map((c) => c.path)).toContain(
      "/api/site/from-flag/deploys",
    );
  });
});
