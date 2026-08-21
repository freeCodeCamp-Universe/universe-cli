import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it, onTestFinished } from "vitest";

const execFileP = promisify(execFile);
const REPO_ROOT = resolve(process.cwd());

describe("create SDK artifact", () => {
  it("exports a working 'create' function", async () => {
    const artifactDirectory = await mkdtemp(join(REPO_ROOT, ".create-sdk-smoke-"));
    onTestFinished(() => rm(artifactDirectory, { recursive: true, force: true }));
    await execFileP(
      "pnpm",
      [
        "--filter",
        "@freecodecamp/universe-create",
        "pack",
        "--pack-destination",
        artifactDirectory,
      ],
      { cwd: REPO_ROOT },
    );
    const [archiveName] = await readdir(artifactDirectory);
    await execFileP("tar", [
      "-xzf",
      join(artifactDirectory, archiveName!),
      "-C",
      artifactDirectory,
    ]);

    const { create } = await import(join(artifactDirectory, "package", "dist", "index.mjs"));
    const firstYield = await create({}).next();
    // To avoid making the test brittle we don't check the details of the yielded value, just that it's not complete.
    expect(firstYield).toMatchObject({ done: false });
  }, 60_000);
});
