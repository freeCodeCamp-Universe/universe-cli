import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBuild } from "../../src/lib/build.js";

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "universe-cli-build-"));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("runBuild", () => {
  it("skips command execution when build.command is undefined", async () => {
    await mkdir(join(tmp, "dist"), { recursive: true });
    const exec = vi.fn();

    const r = await runBuild(
      {
        command: undefined,
        cwd: tmp,
        outputDir: "dist",
      },
      { exec },
    );

    expect(exec).not.toHaveBeenCalled();
    expect(r.skipped).toBe(true);
    expect(r.outputDir).toBe(join(tmp, "dist"));
  });

  it("runs the build command in cwd via injected exec", async () => {
    await mkdir(join(tmp, "dist"), { recursive: true });
    const exec = vi.fn().mockResolvedValue(0);

    const r = await runBuild(
      {
        command: "bun run build",
        cwd: tmp,
        outputDir: "dist",
      },
      { exec },
    );

    expect(exec).toHaveBeenCalledWith({
      command: "bun run build",
      cwd: tmp,
    });
    expect(r.skipped).toBe(false);
  });

  it("returns absolute outputDir path", async () => {
    await mkdir(join(tmp, "build-out"), { recursive: true });
    const exec = vi.fn().mockResolvedValue(0);

    const r = await runBuild(
      {
        command: "noop",
        cwd: tmp,
        outputDir: "build-out",
      },
      { exec },
    );

    expect(r.outputDir).toBe(join(tmp, "build-out"));
  });

  it("throws when build command exits non-zero", async () => {
    const exec = vi.fn().mockResolvedValue(1);

    await expect(
      runBuild(
        {
          command: "false",
          cwd: tmp,
          outputDir: "dist",
        },
        { exec },
      ),
    ).rejects.toThrow(/exit code 1/);
  });

  it("throws when output directory does not exist after build", async () => {
    const exec = vi.fn().mockResolvedValue(0);

    await expect(
      runBuild(
        {
          command: "noop",
          cwd: tmp,
          outputDir: "missing-dir",
        },
        { exec },
      ),
    ).rejects.toThrow(/output directory.*missing-dir/i);
  });

  it("throws when output is a file not a directory", async () => {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(tmp, "dist"), "not a dir");
    const exec = vi.fn().mockResolvedValue(0);

    await expect(
      runBuild(
        {
          command: "noop",
          cwd: tmp,
          outputDir: "dist",
        },
        { exec },
      ),
    ).rejects.toThrow(/not a directory/i);
  });

  it("does not validate output dir when skipped", async () => {
    const exec = vi.fn();
    // No dist dir present.
    await expect(
      runBuild(
        {
          command: undefined,
          cwd: tmp,
          outputDir: "dist",
        },
        { exec },
      ),
    ).rejects.toThrow(/output directory/i);
  });
});
