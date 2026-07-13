import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { ConfigError } from "../../../errors.js";
import type { LayerRegistry } from "./resolve-ordered-layers.js";
import {
  AlwaysSchema,
  DatabaseSchema,
  FrameworkSchema,
  PackageManagerSchema,
  RuntimeSchema,
  ServiceSchema,
} from "./schemas/layers.js";
import { LabelsSchema, type Labels } from "./schemas/labels.js";
import { defaultTemplateVersion, resolveTemplateUrl } from "./assets.js";
import { templateCacheDir } from "./template-cache.js";

const execFileAsync = promisify(execFile);

const EXPECTED_LAYER_FILES = [
  "always.json",
  "database.json",
  "framework.json",
  "package-manager.json",
  "runtime.json",
  "service.json",
] as const;

const EXPECTED_ROOT_ENTRIES = ["labels.json", "layers"] as const;

interface TemplateData {
  labels: Labels;
  registry: LayerRegistry;
}

interface TemplateProvider {
  loadLayers(options?: { forceFetch?: boolean }): Promise<TemplateData>;
}

interface TemplateProviderEnv {
  UNIVERSE_TEMPLATES_DIR?: string;
  UNIVERSE_TEMPLATES_VERSION?: string;
}

type FetchFn = (url: string) => Promise<Response>;

const readEnv = (): TemplateProviderEnv => ({
  UNIVERSE_TEMPLATES_DIR: process.env["UNIVERSE_TEMPLATES_DIR"],
  UNIVERSE_TEMPLATES_VERSION: process.env["UNIVERSE_TEMPLATES_VERSION"],
});

const validateEntries = (
  dir: string,
  expected: readonly string[],
  actual: string[],
): void => {
  const expectedSet = new Set<string>(expected);
  const actualSet = new Set(actual);

  const missing = [...expectedSet].filter((f) => !actualSet.has(f));
  if (missing.length > 0) {
    throw new ConfigError(`Expected files missing from templates: ${missing.join(", ")}`);
  }

  const extra = [...actualSet].filter((f) => !expectedSet.has(f));
  if (extra.length > 0) {
    throw new ConfigError(`Unexpected files in templates directory: ${extra.join(", ")}`);
  }
};

const validateStructure = async (dir: string): Promise<void> => {
  let rootEntries: string[];
  try {
    rootEntries = await readdir(dir);
  } catch {
    throw new ConfigError(`Template directory not found: ${dir}`);
  }

  validateEntries(dir, EXPECTED_ROOT_ENTRIES, rootEntries);

  const layersDir = join(dir, "layers");
  let layerEntries: string[];
  try {
    layerEntries = await readdir(layersDir);
  } catch {
    throw new ConfigError(`Template layers directory not found: ${layersDir}`);
  }

  validateEntries(layersDir, EXPECTED_LAYER_FILES, layerEntries);
};

const parseAndValidate = async (dir: string): Promise<TemplateData> => {
  const readLayer = (name: string) => readFile(join(dir, "layers", name), "utf-8");
  const readRoot = (name: string) => readFile(join(dir, name), "utf-8");

  const [labels, always, database, framework, packageManager, runtime, service] =
    await Promise.all([
      readRoot("labels.json").then((raw) => LabelsSchema.parse(JSON.parse(raw))),
      readLayer("always.json").then((raw) => AlwaysSchema.parse(JSON.parse(raw))),
      readLayer("database.json").then((raw) => DatabaseSchema.parse(JSON.parse(raw))),
      readLayer("framework.json").then((raw) => FrameworkSchema.parse(JSON.parse(raw))),
      readLayer("package-manager.json").then((raw) =>
        PackageManagerSchema.parse(JSON.parse(raw)),
      ),
      readLayer("runtime.json").then((raw) => RuntimeSchema.parse(JSON.parse(raw))),
      readLayer("service.json").then((raw) => ServiceSchema.parse(JSON.parse(raw))),
    ]);

  return {
    labels,
    registry: {
      always,
      frameworks: framework,
      "package-managers": packageManager,
      runtime,
      services: { ...service, ...database },
    },
  };
};

const loadFromDir = async (dir: string): Promise<TemplateData> => {
  await validateStructure(dir);

  try {
    return await parseAndValidate(dir);
  } catch (err) {
    if (err instanceof ConfigError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new ConfigError(`Template validation failed: ${message}`);
  }
};

const cacheHit = async (cacheDir: string): Promise<boolean> => {
  try {
    await stat(join(cacheDir, "labels.json"));
    return true;
  } catch {
    return false;
  }
};

const fetchTarball = async (url: string, fetchImpl: FetchFn): Promise<Buffer> => {
  let response: Response;
  try {
    response = await fetchImpl(url);
  } catch {
    throw new ConfigError(
      "Templates not cached. Run `universe templates fetch` or check network.",
    );
  }

  if (response.status === 404) {
    throw new ConfigError(`Template not found at ${url}. Check UNIVERSE_TEMPLATES_VERSION.`);
  }

  if (!response.ok) {
    throw new ConfigError(
      `Failed to fetch templates from ${url}: HTTP ${String(response.status)}`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
};

const extractTarball = async (tarball: Buffer, destDir: string): Promise<void> => {
  await mkdir(destDir, { recursive: true });

  const tarballPath = join(destDir, "__download.tar.gz");
  await writeFile(tarballPath, tarball);

  try {
    await execFileAsync("tar", ["xzf", tarballPath, "-C", destDir, "--strip-components=0"]);
  } finally {
    await rm(tarballPath, { force: true });
  }
};

const fetchAndCache = async (
  url: string,
  cacheDir: string,
  fetchImpl: FetchFn,
): Promise<TemplateData> => {
  const tarball = await fetchTarball(url, fetchImpl);

  const tmpDir = join(dirname(cacheDir), `.tmp-${Date.now()}`);

  try {
    await extractTarball(tarball, tmpDir);
    await validateStructure(tmpDir);
    const data = await parseAndValidate(tmpDir);

    await mkdir(dirname(cacheDir), { recursive: true });
    await rename(tmpDir, cacheDir);

    return data;
  } catch (err) {
    await rm(tmpDir, { force: true, recursive: true });
    if (err instanceof ConfigError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new ConfigError(`Template validation failed: ${message}`);
  }
};

class RemoteTemplateProvider implements TemplateProvider {
  private readonly env: () => TemplateProviderEnv;
  private readonly cacheBaseOverride?: () => string;
  private readonly fetchImpl: FetchFn;

  constructor(
    env: () => TemplateProviderEnv = readEnv,
    cacheBaseOverride?: () => string,
    fetchImpl: FetchFn = globalThis.fetch,
  ) {
    this.env = env;
    this.cacheBaseOverride = cacheBaseOverride;
    this.fetchImpl = fetchImpl;
  }

  private resolveCacheDir(version: string): string {
    if (this.cacheBaseOverride !== undefined) {
      return join(this.cacheBaseOverride(), version);
    }
    return templateCacheDir(version);
  }

  async loadLayers(options?: { forceFetch?: boolean }): Promise<TemplateData> {
    const { UNIVERSE_TEMPLATES_DIR, UNIVERSE_TEMPLATES_VERSION } = this.env();

    if (UNIVERSE_TEMPLATES_DIR !== undefined && UNIVERSE_TEMPLATES_DIR.length > 0) {
      return loadFromDir(UNIVERSE_TEMPLATES_DIR);
    }

    const version =
      UNIVERSE_TEMPLATES_VERSION && UNIVERSE_TEMPLATES_VERSION.length > 0
        ? UNIVERSE_TEMPLATES_VERSION
        : defaultTemplateVersion;
    const url = resolveTemplateUrl(version);
    const cacheDir = this.resolveCacheDir(version);

    if (options?.forceFetch) {
      await rm(cacheDir, { force: true, recursive: true });
    }

    if (await cacheHit(cacheDir)) {
      return loadFromDir(cacheDir);
    }

    return fetchAndCache(url, cacheDir, this.fetchImpl);
  }
}

export { EXPECTED_LAYER_FILES, EXPECTED_ROOT_ENTRIES, RemoteTemplateProvider, loadFromDir, validateStructure };
export type { FetchFn, TemplateData, TemplateProvider, TemplateProviderEnv };
