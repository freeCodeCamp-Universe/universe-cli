import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, relative, resolve } from "node:path";

const LAYER_TYPE_MAP = [
  ["always.json", "always"],
  ["runtime.json", "runtime"],
  ["package-manager.json", "package-manager"],
  ["framework.json", "framework"],
  ["service.json", "service"],
  ["database.json", "database"],
];

const defaultRoot = () => resolve(fileURLToPath(import.meta.url), "..", "..");

/**
 * @param {string} base
 * @param {string} dir
 * @param {Record<string, string>} files
 * @returns {Promise<void>}
 */
const walkDir = async (base, dir, files) => {
  const entries = await readdir(dir, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.name !== ".gitkeep")
      .map(async (entry) => {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walkDir(base, full, files);
        } else {
          files[relative(base, full)] = await readFile(full, "utf-8");
        }
      }),
  );
};

/**
 * @param {unknown} obj
 * @returns {unknown}
 */
const orderObjectKeys = (obj) => {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return obj;
  }
  // eslint-disable-next-line typescript/no-unsafe-assignment
  const ordered = Object.create(null);
  Object.keys(obj)
    .sort((a, b) => a.localeCompare(b))
    .forEach((key) => {
      // eslint-disable-next-line typescript/no-unsafe-member-access
      ordered[key] = orderObjectKeys(obj[key]);
    });
  return ordered;
};

/**
 * @param {string} [projectRoot]
 * @returns {Promise<void>}
 */
const generateLayerFiles = async (projectRoot = defaultRoot()) => {
  const filesBase = join(projectRoot, "files");
  const layersDir = join(projectRoot, "src", "commands", "create", "layer-composition", "layers");

  const layerResults = await Promise.all(
    LAYER_TYPE_MAP.map(async ([jsonFile, typeName]) => {
      const jsonPath = join(layersDir, jsonFile);
      const typeDir = join(filesBase, typeName);
      const rawText = await readFile(jsonPath, "utf-8");

      /** @type {Record<string, Record<string, unknown>>} */
      // oxlint-disable-next-line typescript/no-unsafe-assignment
      const json = JSON.parse(rawText);
      const jsonKeys = new Set(Object.keys(json));

      /** @type {string[]} */
      let subdirs = [];
      try {
        const entries = await readdir(typeDir, { withFileTypes: true });
        subdirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
      } catch {
        // Type directory does not exist; missing-folder check will fire for each JSON key
      }

      const subdirSet = new Set(subdirs);
      /** @type {string[]} */
      const errors = [];

      await Promise.all(
        subdirs.map(async (subdir) => {
          const gitkeepPath = join(typeDir, subdir, ".gitkeep");
          let hasGitkeep = false;
          try {
            await stat(gitkeepPath);
            hasGitkeep = true;
          } catch {
            // .gitkeep not found
          }

          const hasJson = jsonKeys.has(subdir);

          if (!hasGitkeep && !hasJson) {
            errors.push(
              `files/${typeName}/${subdir}/ has no .gitkeep and no entry in ${jsonFile}. Add the JSON entry or remove the folder`,
            );
          } else if (!hasGitkeep) {
            errors.push(`files/${typeName}/${subdir}/ is missing a .gitkeep. Please add one`);
          } else if (!hasJson) {
            errors.push(`files/${typeName}/${subdir}/ has no entry in ${jsonFile}`);
          }
        }),
      );

      for (const key of jsonKeys) {
        if (!subdirSet.has(key)) {
          errors.push(`${jsonFile} entry "${key}" has no folder at files/${typeName}/${key}/`);
        }
      }

      return { errors, json, jsonFile, jsonPath, typeDir, typeName };
    }),
  );

  const allErrors = layerResults.flatMap((r) => r.errors);
  if (allErrors.length > 0) {
    throw new Error(allErrors.join("\n"));
  }

  await Promise.all(
    layerResults.map(async ({ json, jsonPath, typeDir }) => {
      await Promise.all(
        Object.keys(json).map(async (key) => {
          const keyDir = join(typeDir, key);
          /** @type {Record<string, string>} */
          const files = {};
          await walkDir(keyDir, keyDir, files);
          const entry = json[key];
          if (entry !== undefined) {
            entry.files = files;
          }
        }),
      );
      await writeFile(jsonPath, `${JSON.stringify(orderObjectKeys(json), null, 2)}\n`, "utf-8");
    }),
  );
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await generateLayerFiles();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

export { generateLayerFiles };
