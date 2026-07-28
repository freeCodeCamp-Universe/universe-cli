import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

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

const loadFromDir = async (dir: string): Promise<TemplateData> => {
  await validateStructure(dir);

  try {
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
  } catch (err) {
    if (err instanceof ConfigError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new ConfigError(`Template validation failed: ${message}`);
  }
};

export { EXPECTED_LAYER_FILES, EXPECTED_ROOT_ENTRIES, loadFromDir, validateStructure };
export type { TemplateData };
