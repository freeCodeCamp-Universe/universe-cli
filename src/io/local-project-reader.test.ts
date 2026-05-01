import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ManifestNotFoundError } from "../errors/cli-errors.js";
import { LocalProjectReader } from "./local-project-reader.js";

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

  it("throws ManifestNotFoundError when the file does not exist", async () => {
    const dir = mkdtempSync(join(tmpdir(), "universe-reader-"));
    tempDirectories.push(dir);
    const reader = new LocalProjectReader();

    await expect(reader.readFile(join(dir, "platform.yaml"))).rejects.toThrow(
      ManifestNotFoundError,
    );
  });

  it("includes the attempted path in ManifestNotFoundError", async () => {
    const dir = mkdtempSync(join(tmpdir(), "universe-reader-"));
    tempDirectories.push(dir);
    const filePath = join(dir, "platform.yaml");
    const reader = new LocalProjectReader();

    await expect(reader.readFile(filePath)).rejects.toThrow(
      `Platform manifest not found at "${filePath}"`,
    );
  });
});
