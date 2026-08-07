import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { cp, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { ensureTemplateDir } from "../../../../src/commands/create/layer-composition/template-fetcher.js";
import type { FetchFn } from "../../../../src/commands/create/layer-composition/template-fetcher.js";

const execFileAsync = promisify(execFile);
const FIXTURES_DIR = resolve("tests/fixtures/templates");
const TEMPLATE_VERSION = "1.0.0";

const createTarball = async (sourceDir: string, destPath: string): Promise<void> => {
  const files = await readdir(sourceDir);
  await execFileAsync("tar", ["czf", destPath, "-C", sourceDir, ...files]);
};

const fakeFetchOk = (tarballPath: string): FetchFn => {
  const buffer = readFileSync(tarballPath);
  return async () =>
    new Response(buffer, { status: 200, headers: { "content-type": "application/gzip" } });
};

const fakeFetch404: FetchFn = async () => new Response(null, { status: 404 });

const fakeFetchNetworkError: FetchFn = async () => {
  throw new TypeError("fetch failed");
};

describe("ensureTemplateDir", () => {
  let tmpDir: string;
  let tarballPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "universe-fetcher-test-"));
    tarballPath = join(tmpDir, "templates.tar.gz");
    await createTarball(FIXTURES_DIR, tarballPath);
  });

  afterEach(async () => {
    await rm(tmpDir, { force: true, recursive: true });
  });

  it("returns cache dir when cache is warm", async () => {
    const cacheBase = join(tmpDir, "cache");
    const cacheVersionDir = join(cacheBase, "universe-cli", "templates", TEMPLATE_VERSION);
    await cp(FIXTURES_DIR, cacheVersionDir, { recursive: true });

    const dir = await ensureTemplateDir(
      TEMPLATE_VERSION,
      undefined,
      async () => {
        throw new Error("should not fetch");
      },
      cacheBase,
    );

    expect(dir).toBe(cacheVersionDir);
  });

  it("downloads, extracts, and returns dir on cache miss", async () => {
    const cacheBase = join(tmpDir, "cache");

    const dir = await ensureTemplateDir(
      TEMPLATE_VERSION,
      undefined,
      fakeFetchOk(tarballPath),
      cacheBase,
    );

    const entries = await readdir(dir);
    expect(entries.sort()).toEqual(["files", "labels.json", "layers"]);
  });

  it("re-downloads when forceFetch is true", async () => {
    const cacheBase = join(tmpDir, "cache");
    const cacheVersionDir = join(cacheBase, "universe-cli", "templates", TEMPLATE_VERSION);
    await cp(FIXTURES_DIR, cacheVersionDir, { recursive: true });

    let fetchCount = 0;
    const countingFetch: FetchFn = async (url) => {
      fetchCount++;
      return fakeFetchOk(tarballPath)(url);
    };

    await ensureTemplateDir(TEMPLATE_VERSION, { forceFetch: true }, countingFetch, cacheBase);
    expect(fetchCount).toBe(1);
  });

  it("uses cache on second call (no second fetch)", async () => {
    const cacheBase = join(tmpDir, "cache");
    let fetchCount = 0;
    const countingFetch: FetchFn = async (url) => {
      fetchCount++;
      return fakeFetchOk(tarballPath)(url);
    };

    await ensureTemplateDir(TEMPLATE_VERSION, undefined, countingFetch, cacheBase);
    await ensureTemplateDir(TEMPLATE_VERSION, undefined, countingFetch, cacheBase);
    expect(fetchCount).toBe(1);
  });

  it("throws on HTTP 404", async () => {
    const cacheBase = join(tmpDir, "cache");

    await expect(
      ensureTemplateDir(TEMPLATE_VERSION, undefined, fakeFetch404, cacheBase),
    ).rejects.toThrow("Check UNIVERSE_TEMPLATES_VERSION");
  });

  it("throws on network failure", async () => {
    const cacheBase = join(tmpDir, "cache");

    await expect(
      ensureTemplateDir(TEMPLATE_VERSION, undefined, fakeFetchNetworkError, cacheBase),
    ).rejects.toThrow("check network");
  });

  it("throws and cleans up on corrupted tarball", async () => {
    const corruptedTarball = join(tmpDir, "corrupted.tar.gz");
    await writeFile(corruptedTarball, "not a real tarball");
    const cacheBase = join(tmpDir, "cache");

    await expect(
      ensureTemplateDir(TEMPLATE_VERSION, undefined, fakeFetchOk(corruptedTarball), cacheBase),
    ).rejects.toThrow();

    // No leftover tmp dirs
    const cacheParent = join(cacheBase, "universe-cli", "templates");
    const entries = await readdir(cacheParent);
    const tmpDirs = entries.filter((e) => e.startsWith(".tmp-"));
    expect(tmpDirs).toEqual([]);
  });

  it("throws when extracted tarball has missing files", async () => {
    const badSource = join(tmpDir, "bad-source");
    await cp(FIXTURES_DIR, badSource, { recursive: true });
    await rm(join(badSource, "layers", "always.json"));

    const badTarball = join(tmpDir, "bad.tar.gz");
    await createTarball(badSource, badTarball);
    const cacheBase = join(tmpDir, "cache");

    await expect(
      ensureTemplateDir(TEMPLATE_VERSION, undefined, fakeFetchOk(badTarball), cacheBase),
    ).rejects.toThrow("Expected files missing from templates");
  });

  it("throws when extracted tarball has extra files", async () => {
    const extraSource = join(tmpDir, "extra-source");
    await cp(FIXTURES_DIR, extraSource, { recursive: true });
    await writeFile(join(extraSource, "surprise.json"), "{}");

    const extraTarball = join(tmpDir, "extra.tar.gz");
    await createTarball(extraSource, extraTarball);
    const cacheBase = join(tmpDir, "cache");

    await expect(
      ensureTemplateDir(TEMPLATE_VERSION, undefined, fakeFetchOk(extraTarball), cacheBase),
    ).rejects.toThrow("Unexpected files in templates directory");
  });
});
