import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { LayerConflictError } from "../../../errors/cli-errors.js";
import type { LayerType, ResolvedLayer } from "./resolve-ordered-layers.js";

type JsonValue = boolean | JsonObject | JsonValue[] | null | number | string;

interface JsonObject {
  [key: string]: JsonValue;
}

interface FileOwner {
  layerName: string;
  layerType: LayerType;
}

const CONFIG_EXTENSIONS = new Set([".json", ".yaml", ".yml"]);
const CONCAT_FILENAMES = new Set([".dockerignore"]);

const isConfigFile = (filePath: string): boolean =>
  [...CONFIG_EXTENSIONS].some((ext) => filePath.endsWith(ext));

const isConcatFile = (filePath: string): boolean =>
  CONCAT_FILENAMES.has(filePath.split("/").at(-1) ?? filePath);

const isMergeableFile = (filePath: string): boolean =>
  isConfigFile(filePath) || isConcatFile(filePath);

const isPlainObject = (value: JsonValue): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const mergeValues = (left: JsonValue, right: JsonValue): JsonValue => {
  if (isPlainObject(left) && isPlainObject(right)) {
    const merged: JsonObject = { ...left };

    for (const [key, rightValue] of Object.entries(right)) {
      const leftValue = merged[key];
      merged[key] = leftValue === undefined ? rightValue : mergeValues(leftValue, rightValue);
    }

    return merged;
  }

  if (Array.isArray(right)) {
    return [...right];
  }

  return right;
};

const sortJson = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) {
    return value.map((entry) => sortJson(entry));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const sortedEntries = Object.entries(value)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, entryValue]) => [key, sortJson(entryValue)] as const);

  return Object.fromEntries(sortedEntries);
};

const parseConfig = (filePath: string, content: string): JsonValue => {
  if (filePath.endsWith(".json")) {
    return JSON.parse(content) as JsonValue;
  }

  return parseYaml(content) as JsonValue;
};

const stringifyConfig = (filePath: string, value: JsonValue): string => {
  if (filePath.endsWith(".json")) {
    return JSON.stringify(sortJson(value));
  }

  return stringifyYaml(value);
};

const mergeConfigFiles = (filePath: string, left: string, right: string): string =>
  stringifyConfig(filePath, mergeValues(parseConfig(filePath, left), parseConfig(filePath, right)));

const mergeFiles = (filePath: string, left: string, right: string): string =>
  isConcatFile(filePath)
    ? left + (left.endsWith("\n") ? "" : "\n") + right
    : mergeConfigFiles(filePath, left, right);

const composeLayerFiles = (
  layers: ResolvedLayer[],
  pmPreinstall?: string,
): Record<string, string> => {
  const composedFiles: Record<string, string> = {};
  const owners = new Map<string, FileOwner>();

  for (const layer of layers) {
    const fileEntries = Object.entries(layer.files);

    for (const [filePath, content] of fileEntries) {
      const currentOwner = owners.get(filePath);

      if (currentOwner === undefined) {
        composedFiles[filePath] = content;
        owners.set(filePath, { layerName: layer.name, layerType: layer.layerType });
      } else if (currentOwner.layerType === layer.layerType) {
        throw new LayerConflictError(filePath, currentOwner.layerName, layer.name);
      } else if (isMergeableFile(filePath)) {
        composedFiles[filePath] = mergeFiles(filePath, composedFiles[filePath]!, content);
        owners.set(filePath, { layerName: layer.name, layerType: layer.layerType });
      } else {
        throw new LayerConflictError(filePath, currentOwner.layerName, layer.name);
      }
    }
  }

  if (pmPreinstall !== undefined && composedFiles["package.json"] !== undefined) {
    composedFiles["package.json"] = mergeConfigFiles(
      "package.json",
      composedFiles["package.json"],
      JSON.stringify({ scripts: { preinstall: pmPreinstall } }),
    );
  }

  return composedFiles;
};

export { composeLayerFiles };
