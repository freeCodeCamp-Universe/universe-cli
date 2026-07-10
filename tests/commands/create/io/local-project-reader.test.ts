import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UsageError } from "../../../../src/errors.js";
import { LocalProjectReader } from "../../../../src/commands/create/io/local-project-reader.js";
import { afterEach, describe, expect, it } from "vitest";

const tempDirectories: string[] = [];

describe(LocalProjectReader, () => {
  afterEach(() => {
    for (const directory of tempDirectories) {
      rmSync(directory, { force: true, recursive: true });
    }

    tempDirectories.length = 0;
  });

  it("returns the file content when the file exists", async () => {
    const dir = mkdtempSync(join(tmpdir(), "universe-reader-"));
    tempDirectories.push(dir);
    const filePath = join(dir, "platform.yaml");
    writeFileSync(filePath, "name: hello\n", "utf8");
    const reader = new LocalProjectReader();

    const result = await reader.readFile(filePath);

    expect(result).toBe("name: hello\n");
  });

  it("throws UsageError when the file does not exist", async () => {
    const dir = mkdtempSync(join(tmpdir(), "universe-reader-"));
    tempDirectories.push(dir);
    const reader = new LocalProjectReader();

    await expect(reader.readFile(join(dir, "platform.yaml"))).rejects.toThrow(
      UsageError,
    );
  });

  it("includes the attempted path in UsageError", async () => {
    const dir = mkdtempSync(join(tmpdir(), "universe-reader-"));
    tempDirectories.push(dir);
    const filePath = join(dir, "platform.yaml");
    const reader = new LocalProjectReader();

    await expect(reader.readFile(filePath)).rejects.toThrow(
      `Platform manifest not found at "${filePath}"`,
    );
  });
});
