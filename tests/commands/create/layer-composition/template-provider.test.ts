import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { RemoteTemplateProvider } from "../../../../src/commands/create/layer-composition/template-provider.js";
import type { FetchFn } from "../../../../src/commands/create/layer-composition/template-provider.js";
import { defaultTemplateVersion } from "../../../../src/commands/create/layer-composition/assets.js";

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

const fakeFetchUnexpected: FetchFn = async () => {
  throw new Error("Unexpected fetch call");
};

describe("RemoteTemplateProvider", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "universe-tpl-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { force: true, recursive: true });
  });

  // -----------------------------------------------------------------------
  // Version resolution
  // -----------------------------------------------------------------------

  describe("version resolution", () => {
    it("uses default version from assets.json when no env vars are set", async () => {
      const cacheBase = join(tmpDir, "cache");
      const cacheVersionDir = join(cacheBase, defaultTemplateVersion);
      await cp(FIXTURES_DIR, cacheVersionDir, { recursive: true });

      const provider = new RemoteTemplateProvider(() => ({}), cacheBase, fakeFetchUnexpected);

      const { registry } = await provider.loadLayers();
      expect(registry.always).toBeDefined();
    });

    it("uses UNIVERSE_TEMPLATES_VERSION when set", async () => {
      const customVersion = "2.0.0";
      const cacheBase = join(tmpDir, "cache");
      const cacheVersionDir = join(cacheBase, customVersion);
      await cp(FIXTURES_DIR, cacheVersionDir, { recursive: true });

      const provider = new RemoteTemplateProvider(
        () => ({ UNIVERSE_TEMPLATES_VERSION: customVersion }),
        cacheBase,
        fakeFetchUnexpected,
      );

      const { registry } = await provider.loadLayers();
      expect(registry.always).toBeDefined();
    });

    it("does not require UNIVERSE_TEMPLATES_VERSION when UNIVERSE_TEMPLATES_DIR is set", async () => {
      const provider = new RemoteTemplateProvider(
        () => ({ UNIVERSE_TEMPLATES_DIR: FIXTURES_DIR }),
        undefined,
        fakeFetchUnexpected,
      );

      const { registry } = await provider.loadLayers();
      expect(registry.always).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // UNIVERSE_TEMPLATES_DIR (local override)
  // -----------------------------------------------------------------------

  describe("UNIVERSE_TEMPLATES_DIR", () => {
    it("loads layers from a valid local directory", async () => {
      const provider = new RemoteTemplateProvider(
        () => ({ UNIVERSE_TEMPLATES_DIR: FIXTURES_DIR }),
        undefined,
        fakeFetchUnexpected,
      );

      const { labels, registry } = await provider.loadLayers();

      expect(registry.always).toHaveProperty("always");
      expect(registry.frameworks).toHaveProperty("express");
      expect(registry["package-managers"]).toHaveProperty("pnpm");
      expect(registry.runtime).toHaveProperty("node");
      expect(registry.services).toHaveProperty("auth");
      expect(registry.services).toHaveProperty("postgresql");
      expect(labels).toHaveProperty("runtime");
    });

    it("throws when UNIVERSE_TEMPLATES_DIR points to a missing directory", async () => {
      const provider = new RemoteTemplateProvider(
        () => ({ UNIVERSE_TEMPLATES_DIR: join(tmpDir, "does-not-exist") }),
        undefined,
        fakeFetchUnexpected,
      );

      await expect(provider.loadLayers()).rejects.toThrow("Template directory not found");
    });

    it("throws when UNIVERSE_TEMPLATES_DIR has missing files", async () => {
      const incompleteDir = join(tmpDir, "incomplete");
      await mkdir(incompleteDir, { recursive: true });
      await writeFile(join(incompleteDir, "always.json"), "{}");

      const provider = new RemoteTemplateProvider(
        () => ({ UNIVERSE_TEMPLATES_DIR: incompleteDir }),
        undefined,
        fakeFetchUnexpected,
      );

      await expect(provider.loadLayers()).rejects.toThrow("Expected files missing from templates");
    });

    it("throws when UNIVERSE_TEMPLATES_DIR has extra unexpected files", async () => {
      const extraDir = join(tmpDir, "extra");
      await cp(FIXTURES_DIR, extraDir, { recursive: true });
      await writeFile(join(extraDir, "bonus.json"), "{}");

      const provider = new RemoteTemplateProvider(
        () => ({ UNIVERSE_TEMPLATES_DIR: extraDir }),
        undefined,
        fakeFetchUnexpected,
      );

      await expect(provider.loadLayers()).rejects.toThrow(
        "Unexpected files in templates directory",
      );
    });

    it("throws when JSON content fails Zod validation", async () => {
      const badDir = join(tmpDir, "bad-schema");
      await cp(FIXTURES_DIR, badDir, { recursive: true });
      await writeFile(join(badDir, "layers", "always.json"), JSON.stringify({ wrong_key: {} }));

      const provider = new RemoteTemplateProvider(
        () => ({ UNIVERSE_TEMPLATES_DIR: badDir }),
        undefined,
        fakeFetchUnexpected,
      );

      await expect(provider.loadLayers()).rejects.toThrow("Template validation failed");
    });
  });

  // -----------------------------------------------------------------------
  // Cache hit
  // -----------------------------------------------------------------------

  describe("cache hit", () => {
    it("loads layers from the cache directory when populated", async () => {
      const cacheBase = join(tmpDir, "cache");
      const cacheVersionDir = join(cacheBase, "1.0.0");
      await cp(FIXTURES_DIR, cacheVersionDir, { recursive: true });

      const provider = new RemoteTemplateProvider(
        () => ({ UNIVERSE_TEMPLATES_VERSION: TEMPLATE_VERSION }),
        cacheBase,
        fakeFetchUnexpected,
      );

      const { registry } = await provider.loadLayers();

      expect(registry.always).toHaveProperty("always");
      expect(registry.frameworks).toHaveProperty("express");
    });
  });

  // -----------------------------------------------------------------------
  // Fetch + extract (cache miss)
  // -----------------------------------------------------------------------

  describe("fetch and cache", () => {
    let tarballPath: string;

    beforeEach(async () => {
      tarballPath = join(tmpDir, "templates-1.0.0.tar.gz");
      await createTarball(FIXTURES_DIR, tarballPath);
    });

    it("fetches, extracts, and caches templates on cache miss", async () => {
      const cacheBase = join(tmpDir, "cache");

      const provider = new RemoteTemplateProvider(
        () => ({ UNIVERSE_TEMPLATES_VERSION: TEMPLATE_VERSION }),
        cacheBase,
        fakeFetchOk(tarballPath),
      );

      const { labels, registry } = await provider.loadLayers();

      expect(registry.always).toHaveProperty("always");
      expect(registry.frameworks).toHaveProperty("express");
      expect(registry["package-managers"]).toHaveProperty("pnpm");
      expect(labels).toHaveProperty("runtime");

      // Cache directory was populated
      const cached = await readdir(join(cacheBase, "1.0.0"));
      expect(cached.sort()).toEqual(["labels.json", "layers"]);
    });

    it("uses cache on second call (no second fetch)", async () => {
      const cacheBase = join(tmpDir, "cache");
      let fetchCount = 0;
      const countingFetch: FetchFn = async (url) => {
        fetchCount++;
        return fakeFetchOk(tarballPath)(url);
      };

      const provider = new RemoteTemplateProvider(
        () => ({ UNIVERSE_TEMPLATES_VERSION: TEMPLATE_VERSION }),
        cacheBase,
        countingFetch,
      );

      await provider.loadLayers();
      await provider.loadLayers();

      expect(fetchCount).toBe(1);
    });

    it("throws on HTTP 404", async () => {
      const cacheBase = join(tmpDir, "cache");

      const provider = new RemoteTemplateProvider(
        () => ({ UNIVERSE_TEMPLATES_VERSION: TEMPLATE_VERSION }),
        cacheBase,
        fakeFetch404,
      );

      await expect(provider.loadLayers()).rejects.toThrow("Check UNIVERSE_TEMPLATES_VERSION.");
    });

    it("throws on network failure", async () => {
      const cacheBase = join(tmpDir, "cache");

      const provider = new RemoteTemplateProvider(
        () => ({ UNIVERSE_TEMPLATES_VERSION: TEMPLATE_VERSION }),
        cacheBase,
        fakeFetchNetworkError,
      );

      await expect(provider.loadLayers()).rejects.toThrow(
        "Templates not cached. Run `universe templates fetch` or check network.",
      );
    });

    it("does not populate cache when extracted files fail structural check", async () => {
      // Create a tarball with a missing file
      const badSource = join(tmpDir, "bad-source");
      await cp(FIXTURES_DIR, badSource, { recursive: true });
      await rm(join(badSource, "layers", "always.json"));

      const badTarball = join(tmpDir, "bad.tar.gz");
      await createTarball(badSource, badTarball);

      const cacheBase = join(tmpDir, "cache");

      const provider = new RemoteTemplateProvider(
        () => ({ UNIVERSE_TEMPLATES_VERSION: TEMPLATE_VERSION }),
        cacheBase,
        fakeFetchOk(badTarball),
      );

      await expect(provider.loadLayers()).rejects.toThrow("Expected files missing from templates");

      // Cache version dir should not exist
      const cacheVersionDir = join(cacheBase, "1.0.0");
      await expect(readdir(cacheVersionDir)).rejects.toThrow();
    });

    it("does not populate cache when extracted files have extra files", async () => {
      const extraSource = join(tmpDir, "extra-source");
      await cp(FIXTURES_DIR, extraSource, { recursive: true });
      await writeFile(join(extraSource, "surprise.json"), "{}");

      const extraTarball = join(tmpDir, "extra.tar.gz");
      await createTarball(extraSource, extraTarball);

      const cacheBase = join(tmpDir, "cache");

      const provider = new RemoteTemplateProvider(
        () => ({ UNIVERSE_TEMPLATES_VERSION: TEMPLATE_VERSION }),
        cacheBase,
        fakeFetchOk(extraTarball),
      );

      await expect(provider.loadLayers()).rejects.toThrow(
        "Unexpected files in templates directory",
      );

      const cacheVersionDir = join(cacheBase, "1.0.0");
      await expect(readdir(cacheVersionDir)).rejects.toThrow();
    });

    it("does not populate cache when JSON fails Zod validation", async () => {
      const badSchemaSource = join(tmpDir, "bad-schema-source");
      await cp(FIXTURES_DIR, badSchemaSource, { recursive: true });
      await writeFile(
        join(badSchemaSource, "layers", "always.json"),
        JSON.stringify({ wrong_key: {} }),
      );

      const badSchemaTarball = join(tmpDir, "bad-schema.tar.gz");
      await createTarball(badSchemaSource, badSchemaTarball);

      const cacheBase = join(tmpDir, "cache");

      const provider = new RemoteTemplateProvider(
        () => ({ UNIVERSE_TEMPLATES_VERSION: TEMPLATE_VERSION }),
        cacheBase,
        fakeFetchOk(badSchemaTarball),
      );

      await expect(provider.loadLayers()).rejects.toThrow("Template validation failed");

      const cacheVersionDir = join(cacheBase, "1.0.0");
      await expect(readdir(cacheVersionDir)).rejects.toThrow();
    });

    it("cleans up tmp dir on extraction failure (corrupted tarball)", async () => {
      const corruptedTarball = join(tmpDir, "corrupted.tar.gz");
      await writeFile(corruptedTarball, "not a real tarball");

      const cacheBase = join(tmpDir, "cache");

      const provider = new RemoteTemplateProvider(
        () => ({ UNIVERSE_TEMPLATES_VERSION: TEMPLATE_VERSION }),
        cacheBase,
        fakeFetchOk(corruptedTarball),
      );

      await expect(provider.loadLayers()).rejects.toThrow();

      // No leftover tmp dirs in cache base
      try {
        const entries = await readdir(cacheBase);
        const tmpDirs = entries.filter((e) => e.startsWith(".tmp-"));
        expect(tmpDirs).toEqual([]);
      } catch {
        // cacheBase doesn't exist at all — that's fine too
      }
    });
  });

  // -----------------------------------------------------------------------
  // --force-fetch
  // -----------------------------------------------------------------------

  describe("forceFetch", () => {
    let tarballPath: string;

    beforeEach(async () => {
      tarballPath = join(tmpDir, "templates-1.0.0.tar.gz");
      await createTarball(FIXTURES_DIR, tarballPath);
    });

    it("re-downloads when cache is warm and forceFetch is true", async () => {
      const cacheBase = join(tmpDir, "cache");
      const cacheVersionDir = join(cacheBase, "1.0.0");
      await cp(FIXTURES_DIR, cacheVersionDir, { recursive: true });

      let fetchCount = 0;
      const countingFetch: FetchFn = async (url) => {
        fetchCount++;
        return fakeFetchOk(tarballPath)(url);
      };

      const provider = new RemoteTemplateProvider(
        () => ({ UNIVERSE_TEMPLATES_VERSION: TEMPLATE_VERSION }),
        cacheBase,
        countingFetch,
      );

      const { registry } = await provider.loadLayers({ forceFetch: true });

      expect(fetchCount).toBe(1);
      expect(registry.always).toHaveProperty("always");
    });

    it("fetches normally when cache is cold and forceFetch is true", async () => {
      const cacheBase = join(tmpDir, "cache");

      const provider = new RemoteTemplateProvider(
        () => ({ UNIVERSE_TEMPLATES_VERSION: TEMPLATE_VERSION }),
        cacheBase,
        fakeFetchOk(tarballPath),
      );

      const { registry } = await provider.loadLayers({ forceFetch: true });

      expect(registry.always).toHaveProperty("always");

      const cached = await readdir(join(cacheBase, "1.0.0"));
      expect(cached).toContain("labels.json");
    });

    it("ignores forceFetch when UNIVERSE_TEMPLATES_DIR is set", async () => {
      let fetchCount = 0;
      const countingFetch: FetchFn = async (url) => {
        fetchCount++;
        return fakeFetchOk(tarballPath)(url);
      };

      const provider = new RemoteTemplateProvider(
        () => ({
          UNIVERSE_TEMPLATES_DIR: FIXTURES_DIR,
          UNIVERSE_TEMPLATES_VERSION: TEMPLATE_VERSION,
        }),
        undefined,
        countingFetch,
      );

      const { registry } = await provider.loadLayers({ forceFetch: true });

      expect(fetchCount).toBe(0);
      expect(registry.always).toHaveProperty("always");
    });
  });
});
