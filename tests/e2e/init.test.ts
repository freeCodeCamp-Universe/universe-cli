import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parsePlatformYaml } from "../../src/lib/platform-yaml.js";
import { runBinary } from "./_helpers/spawn-cli.js";

const ENV: NodeJS.ProcessEnv = {
  NO_COLOR: "1",
  UNIVERSE_NO_UPDATE_CHECK: "1",
};
if (process.env["PATH"]) ENV["PATH"] = process.env["PATH"];

describe("init E2E (spawned binary, real filesystem)", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    while (dirs.length > 0) {
      await rm(dirs.pop()!, { recursive: true, force: true });
    }
  });

  async function project(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "universe-cli-init-"));
    dirs.push(dir);
    return dir;
  }

  it("scaffolds a schema-valid platform.yaml with --yes", async () => {
    const dir = await project();
    const r = await runBinary(
      ["init", "--json", "--yes", "--site", "my-fresh-site"],
      ENV,
      dir,
    );
    expect(r.exitCode, `stderr=${r.stderr}\nstdout=${r.stdout}`).toBe(0);
    const env = JSON.parse(r.stdout.trim()) as Record<string, unknown>;
    expect(env["command"]).toBe("init");
    expect(env["site"]).toBe("my-fresh-site");

    const written = await readFile(join(dir, "platform.yaml"), "utf-8");
    expect(written).toContain("site: my-fresh-site");
    const parsed = parsePlatformYaml(written);
    expect(parsed.ok).toBe(true);
  }, 60_000);

  it("infers the build command from package.json + lockfile", async () => {
    const dir = await project();
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ scripts: { build: "vite build" } }),
      "utf-8",
    );
    await writeFile(
      join(dir, "pnpm-lock.yaml"),
      "lockfileVersion: 9\n",
      "utf-8",
    );
    const r = await runBinary(["init", "--yes", "--site", "built"], ENV, dir);
    expect(r.exitCode, `stderr=${r.stderr}\nstdout=${r.stdout}`).toBe(0);
    const written = await readFile(join(dir, "platform.yaml"), "utf-8");
    expect(written).toContain("command: pnpm run build");
  }, 60_000);

  it("refuses to overwrite without --force, succeeds with it", async () => {
    const dir = await project();
    await writeFile(join(dir, "platform.yaml"), "site: existing\n", "utf-8");

    const refused = await runBinary(["init", "--json", "--yes"], ENV, dir);
    expect(refused.exitCode).toBe(11);

    const forced = await runBinary(
      ["init", "--json", "--yes", "--force", "--site", "replaced"],
      ENV,
      dir,
    );
    expect(forced.exitCode, `stderr=${forced.stderr}`).toBe(0);
    const written = await readFile(join(dir, "platform.yaml"), "utf-8");
    expect(written).toContain("site: replaced");
  }, 60_000);
});
