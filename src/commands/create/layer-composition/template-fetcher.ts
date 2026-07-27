import { execFile } from "node:child_process";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { ConfigError } from "../../../errors.js";
import { resolveTemplateUrl } from "./assets.js";
import { templatesCache } from "./template-cache.js";

const execFileAsync = promisify(execFile);

type FetchFn = (url: string) => Promise<Response>;

const EXPECTED_LAYER_FILES = [
  "always.json",
  "database.json",
  "framework.json",
  "package-manager.json",
  "runtime.json",
  "service.json",
] as const;

const EXPECTED_ROOT_ENTRIES = ["labels.json", "layers"] as const;

const validateEntries = (expected: readonly string[], actual: string[]): void => {
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

  validateEntries(EXPECTED_ROOT_ENTRIES, rootEntries);

  const layersDir = join(dir, "layers");
  let layerEntries: string[];
  try {
    layerEntries = await readdir(layersDir);
  } catch {
    throw new ConfigError(`Template layers directory not found: ${layersDir}`);
  }

  validateEntries(EXPECTED_LAYER_FILES, layerEntries);
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
    throw new ConfigError("Templates not cached. Run `universe templates fetch` or check network.");
  }

  if (response.status === 404) {
    throw new ConfigError(`Template not found at ${url}. Check UNIVERSE_TEMPLATES_VERSION.`);
  }

  if (!response.ok) {
    throw new ConfigError(`Failed to fetch templates from ${url}: HTTP ${String(response.status)}`);
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

export async function ensureTemplateDir(
  version: string,
  options?: { forceFetch?: boolean },
  fetchImpl: FetchFn = globalThis.fetch,
  cacheBaseOverride?: string,
): Promise<string> {
  const url = resolveTemplateUrl(version);
  const cacheDir = cacheBaseOverride
    ? join(cacheBaseOverride, "universe-cli", "templates", version)
    : join(templatesCache(), version);

  if (options?.forceFetch) {
    await rm(cacheDir, { force: true, recursive: true });
  }

  if (await cacheHit(cacheDir)) {
    return cacheDir;
  }

  const tarball = await fetchTarball(url, fetchImpl);
  const tmpDir = join(dirname(cacheDir), `.tmp-${Date.now()}`);

  try {
    await extractTarball(tarball, tmpDir);
    await validateStructure(tmpDir);

    await mkdir(dirname(cacheDir), { recursive: true });
    await rename(tmpDir, cacheDir);

    return cacheDir;
  } catch (err) {
    await rm(tmpDir, { force: true, recursive: true });
    if (err instanceof ConfigError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new ConfigError(`Template extraction failed: ${message}`);
  }
}

export type { FetchFn };
