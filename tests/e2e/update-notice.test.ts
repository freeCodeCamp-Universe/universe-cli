import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBinary } from "./_helpers/spawn-cli.js";
import { EXIT_USAGE } from "../../src/output/exit-codes.js";

let tmp: string | undefined;
let server: Server | undefined;

afterEach(async () => {
  if (server) {
    await new Promise<void>((res) => server?.close(() => res()));
    server = undefined;
  }
  if (tmp) {
    await rm(tmp, { recursive: true, force: true });
    tmp = undefined;
  }
});

async function seedCache(
  dir: string,
  latest: string,
  lastCheck: number,
): Promise<void> {
  const cfg = join(dir, "universe-cli");
  await mkdir(cfg, { recursive: true, mode: 0o700 });
  await writeFile(
    join(cfg, "update-check.json"),
    JSON.stringify({ latest, lastCheck }),
    { mode: 0o644 },
  );
}

function baseEnv(dir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { XDG_CONFIG_HOME: dir, NO_COLOR: "1" };
  if (process.env["PATH"]) env["PATH"] = process.env["PATH"];
  return env;
}

describe("update notice (spawned binary)", () => {
  it("surfaces the notice on a process.exit() error path over a pipe", async () => {
    tmp = await mkdtemp(join(tmpdir(), "universe-cli-notice-"));
    await seedCache(tmp, "99.0.0", Date.now());

    const result = await runBinary(["repo", "bogus"], baseEnv(tmp));

    expect(result.exitCode).toBe(EXIT_USAGE);
    expect(result.stderr).toMatch(/Update available: .+ → 99\.0\.0/);
  }, 60_000);

  it("detached worker refreshes the cache after the parent exits", async () => {
    tmp = await mkdtemp(join(tmpdir(), "universe-cli-worker-"));

    server = createServer((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ version: "99.0.0" }));
    });
    const port = await new Promise<number>((res) => {
      server?.listen(0, "127.0.0.1", () => {
        const addr = server?.address();
        res(typeof addr === "object" && addr ? addr.port : 0);
      });
    });

    const env = baseEnv(tmp);
    env["UNIVERSE_UPDATE_URL"] = `http://127.0.0.1:${port}/latest`;

    await runBinary(["repo", "bogus"], env);

    const cacheFile = join(tmp, "universe-cli", "update-check.json");
    let latest: string | undefined;
    for (let i = 0; i < 80; i += 1) {
      try {
        const raw = await readFile(cacheFile, "utf-8");
        latest = (JSON.parse(raw) as { latest?: string }).latest;
        if (latest === "99.0.0") break;
      } catch {
        void 0;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(latest).toBe("99.0.0");
  }, 60_000);
});
