import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StorageError } from "../../errors/cli-errors.js";
import { walkFiles } from "./walk.js";

describe(walkFiles, () => {
  let root: string;
  let base: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "universe-cli-walk-"));
    base = join(root, "base");
    mkdirSync(base, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { force: true, recursive: true });
  });

  it("returns relative paths for regular files recursively", () => {
    writeFileSync(join(base, "a.html"), "a");
    mkdirSync(join(base, "nested"));
    writeFileSync(join(base, "nested", "b.css"), "b");
    const files = walkFiles(base)
      .map((f) => f.relPath)
      .sort();
    expect(files).toStrictEqual(["a.html", "nested/b.css"]);
  });

  it("follows symlinked directories that stay inside base", () => {
    const inner = join(base, "inner");
    mkdirSync(inner);
    writeFileSync(join(inner, "asset.js"), "x");
    symlinkSync(inner, join(base, "linked"));
    const rels = walkFiles(base).map((f) => f.relPath);
    expect(rels).toContain("inner/asset.js");
    expect(rels).toContain("linked/asset.js");
  });

  it("throws StorageError on symlinked directory escaping base", () => {
    const escape = join(root, "escape");
    mkdirSync(escape);
    writeFileSync(join(escape, "secret.txt"), "SECRET");
    symlinkSync(escape, join(base, "linked"));
    expect(() => walkFiles(base)).toThrow(StorageError);
  });

  it("throws StorageError on dangling symlink", () => {
    symlinkSync(join(root, "missing-target"), join(base, "leaky"));
    expect(() => walkFiles(base)).toThrow(StorageError);
  });

  it("skips directory entries themselves, only returns files", () => {
    mkdirSync(join(base, "emptydir"));
    writeFileSync(join(base, "only.html"), "x");
    const files = walkFiles(base).map((f) => f.relPath);
    expect(files).toStrictEqual(["only.html"]);
  });
});
