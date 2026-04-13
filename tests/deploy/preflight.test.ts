import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateOutputDir } from "../../src/deploy/preflight.js";

const TEST_ROOT = join(tmpdir(), "universe-cli-preflight-test");

describe("validateOutputDir", () => {
  beforeEach(() => {
    mkdirSync(TEST_ROOT, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_ROOT, { recursive: true, force: true });
  });

  it("returns valid: false with error when directory does not exist", () => {
    const result = validateOutputDir(join(TEST_ROOT, "nonexistent"));
    expect(result).toEqual({
      valid: false,
      fileCount: 0,
      error: "directory not found",
    });
  });

  it("returns valid: false with error when path is a file, not a directory", () => {
    const filePath = join(TEST_ROOT, "notadir.txt");
    writeFileSync(filePath, "hello");

    const result = validateOutputDir(filePath);
    expect(result).toEqual({
      valid: false,
      fileCount: 0,
      error: "not a directory",
    });
  });

  it("returns valid: false with error when directory is empty", () => {
    const emptyDir = join(TEST_ROOT, "empty");
    mkdirSync(emptyDir);

    const result = validateOutputDir(emptyDir);
    expect(result).toEqual({
      valid: false,
      fileCount: 0,
      error: "directory is empty",
    });
  });

  it("returns valid: true with file count for directory with files", () => {
    const dir = join(TEST_ROOT, "dist");
    mkdirSync(dir);
    writeFileSync(join(dir, "index.html"), "<html></html>");
    writeFileSync(join(dir, "style.css"), "body {}");

    const result = validateOutputDir(dir);
    expect(result).toEqual({ valid: true, fileCount: 2 });
  });

  it("counts files recursively in nested directories", () => {
    const dir = join(TEST_ROOT, "nested");
    mkdirSync(join(dir, "assets", "img"), { recursive: true });
    writeFileSync(join(dir, "index.html"), "<html></html>");
    writeFileSync(join(dir, "assets", "main.js"), "console.log()");
    writeFileSync(join(dir, "assets", "img", "logo.png"), "pngdata");

    const result = validateOutputDir(dir);
    expect(result).toEqual({ valid: true, fileCount: 3 });
  });

  it("does not count directories as files", () => {
    const dir = join(TEST_ROOT, "withsubdirs");
    mkdirSync(join(dir, "subdir"), { recursive: true });
    writeFileSync(join(dir, "file.txt"), "content");

    const result = validateOutputDir(dir);
    expect(result).toEqual({ valid: true, fileCount: 1 });
  });

  it("returns valid: false when directory contains only empty subdirectories", () => {
    const dir = join(TEST_ROOT, "emptysubdirs");
    mkdirSync(join(dir, "sub1"), { recursive: true });
    mkdirSync(join(dir, "sub2"), { recursive: true });

    const result = validateOutputDir(dir);
    expect(result).toEqual({
      valid: false,
      fileCount: 0,
      error: "directory is empty",
    });
  });
});
