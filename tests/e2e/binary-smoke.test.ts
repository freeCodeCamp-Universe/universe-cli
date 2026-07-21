import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type CliEnv, makeCliEnv } from "./_helpers/cli-env.js";
import { type FakeArtemis, type SiteRow, startFakeArtemis } from "./_helpers/fake-artemis.js";
import { runBinary } from "./_helpers/spawn-cli.js";

/**
 * Spawned-binary smoke matrix.
 *
 * Boots fake-artemis and builds dist/ exactly once via beforeAll
 * (SPEC §V9). Each verb gets one happy-path scenario with loose
 * assertions: exit 0 + parseable JSON envelope. Full behavior
 * coverage lives in tests/e2e/<verb>.test.ts (in-process layer).
 *
 * Login is intentionally absent — the spawned subprocess can't
 * accept a custom fetch override, and there's no env hook for the
 * device-flow base URL in src/lib/device-flow.ts (recorded as a
 * deferred capability gap; T15 covers login fully in-process).
 */

const TOKEN = "ghp_e2e_smoke";
const SITE = "smoke-site";

function row(slug: string): SiteRow {
  return {
    slug,
    teams: ["staff"],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    createdBy: "alice",
  };
}

function resetState(server: FakeArtemis): void {
  server.state.tokens.clear();
  server.state.failures.clear();
  server.state.registry.clear();
  server.state.deploysBySite.clear();
  server.state.deploys.clear();
  server.state.deployJwts.clear();
  server.state.aliases.preview.clear();
  server.state.aliases.production.clear();
  server.state.uploadFailPaths.clear();
  server.state.finalizeFailure = null;
  server.callLog.length = 0;
  server.state.tokens.set(TOKEN, {
    login: "alice",
    authorizedSites: [SITE],
  });
}

async function makeProject(
  site: string,
  files: Record<string, string> = {},
): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "universe-cli-e2e-bin-"));
  await writeFile(join(dir, "platform.yaml"), `site: ${site}\n`, "utf-8");
  if (Object.keys(files).length > 0) {
    const distDir = join(dir, "dist");
    await mkdir(distDir, { recursive: true });
    for (const [path, body] of Object.entries(files)) {
      await writeFile(join(distDir, path), body, "utf-8");
    }
  }
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

describe("binary smoke matrix (10 verbs × 1 happy-path)", () => {
  let server: FakeArtemis;
  let env: CliEnv;
  const projects: Array<{ cleanup: () => Promise<void> }> = [];

  beforeAll(async () => {
    server = await startFakeArtemis();
    env = await makeCliEnv({ proxyUrl: server.url, githubToken: TOKEN });
  }, 120_000);

  afterAll(async () => {
    await env.cleanup();
    await server.close();
    while (projects.length > 0) {
      const p = projects.pop()!;
      await p.cleanup();
    }
  });

  it("whoami --json", async () => {
    resetState(server);
    const r = await runBinary(["whoami", "--json"], env.env);
    expect(r.exitCode, `stderr=${r.stderr}\nstdout=${r.stdout}`).toBe(0);
    expect((JSON.parse(r.stdout.trim()) as { command: string }).command).toBe("whoami");
  }, 60_000);

  it("init --json --yes", async () => {
    resetState(server);
    const project = await makeProject("smoke-init");
    projects.push(project);
    const r = await runBinary(
      ["init", "--json", "--yes", "--force", "--site", "smoke-init"],
      env.env,
      project.dir,
    );
    expect(r.exitCode, `stderr=${r.stderr}\nstdout=${r.stdout}`).toBe(0);
    expect((JSON.parse(r.stdout.trim()) as { command: string }).command).toBe("init");
  }, 60_000);

  it("static ls --json --site <site>", async () => {
    resetState(server);
    server.state.registry.set(SITE, row(SITE));
    const r = await runBinary(["static", "ls", "--json", "--site", SITE], env.env);
    expect(r.exitCode, `stderr=${r.stderr}\nstdout=${r.stdout}`).toBe(0);
    expect((JSON.parse(r.stdout.trim()) as { command: string }).command).toBe("ls");
  }, 60_000);

  it("static deploy --json (preview)", async () => {
    resetState(server);
    server.state.registry.set(SITE, row(SITE));
    const project = await makeProject(SITE, { "index.html": "<html></html>" });
    projects.push(project);
    const r = await runBinary(["static", "deploy", "--json"], env.env, project.dir);
    expect(r.exitCode, `stderr=${r.stderr}\nstdout=${r.stdout}`).toBe(0);
    const env0 = JSON.parse(r.stdout.trim()) as Record<string, unknown>;
    expect(env0["command"]).toBe("deploy");
    expect(env0["mode"]).toBe("preview");
  }, 60_000);

  it("static promote --json", async () => {
    resetState(server);
    server.state.registry.set(SITE, row(SITE));
    server.state.aliases.preview.set(SITE, "20260301-091500-aaa1111");
    const project = await makeProject(SITE);
    projects.push(project);
    const r = await runBinary(["static", "promote", "--json"], env.env, project.dir);
    expect(r.exitCode, `stderr=${r.stderr}\nstdout=${r.stdout}`).toBe(0);
    expect((JSON.parse(r.stdout.trim()) as { command: string }).command).toBe("promote");
  }, 60_000);

  it("static rollback --json --to <id>", async () => {
    resetState(server);
    server.state.registry.set(SITE, row(SITE));
    server.state.deploysBySite.set(SITE, [{ deployId: "20260101-090000-old0000" }]);
    const project = await makeProject(SITE);
    projects.push(project);
    const r = await runBinary(
      ["static", "rollback", "--json", "--to", "20260101-090000-old0000"],
      env.env,
      project.dir,
    );
    expect(r.exitCode, `stderr=${r.stderr}\nstdout=${r.stdout}`).toBe(0);
    expect((JSON.parse(r.stdout.trim()) as { command: string }).command).toBe("rollback");
  }, 60_000);

  it("sites register --json <slug>", async () => {
    resetState(server);
    const r = await runBinary(["sites", "register", "smoke-fresh", "--json"], env.env);
    expect(r.exitCode, `stderr=${r.stderr}\nstdout=${r.stdout}`).toBe(0);
    expect((JSON.parse(r.stdout.trim()) as { command: string }).command).toBe("sites register");
  }, 60_000);

  it("sites ls --json", async () => {
    resetState(server);
    server.state.registry.set(SITE, row(SITE));
    const r = await runBinary(["sites", "ls", "--json"], env.env);
    expect(r.exitCode, `stderr=${r.stderr}\nstdout=${r.stdout}`).toBe(0);
    expect((JSON.parse(r.stdout.trim()) as { command: string }).command).toBe("sites ls");
  }, 60_000);

  it("sites update --json <slug> --team <team>", async () => {
    resetState(server);
    server.state.registry.set(SITE, row(SITE));
    const r = await runBinary(
      ["sites", "update", SITE, "--json", "--team", "news-editors"],
      env.env,
    );
    expect(r.exitCode, `stderr=${r.stderr}\nstdout=${r.stdout}`).toBe(0);
    expect((JSON.parse(r.stdout.trim()) as { command: string }).command).toBe("sites update");
  }, 60_000);

  it("sites rm --json <slug>", async () => {
    resetState(server);
    server.state.registry.set(SITE, row(SITE));
    const r = await runBinary(["sites", "rm", SITE, "--json"], env.env);
    expect(r.exitCode, `stderr=${r.stderr}\nstdout=${r.stdout}`).toBe(0);
    expect((JSON.parse(r.stdout.trim()) as { command: string }).command).toBe("sites rm");
  }, 60_000);

  it("logout --json (idempotent — no token to remove)", async () => {
    const logoutEnv = await makeCliEnv({
      proxyUrl: server.url,
      githubToken: TOKEN,
    });
    try {
      const r = await runBinary(["logout", "--json"], logoutEnv.env);
      expect(r.exitCode, `stderr=${r.stderr}\nstdout=${r.stdout}`).toBe(0);
      expect((JSON.parse(r.stdout.trim()) as { command: string }).command).toBe("logout");
    } finally {
      await logoutEnv.cleanup();
    }
  }, 60_000);
});
