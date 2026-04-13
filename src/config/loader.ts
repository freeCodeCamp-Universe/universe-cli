import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { platformSchema, type PlatformConfig } from "./schema.js";

export type ResolvedConfig = PlatformConfig;

export interface LoadConfigFlags {
  outputDir?: string;
  bucket?: string;
  rcloneRemote?: string;
  region?: string;
}

export interface LoadConfigOptions {
  cwd?: string;
  flags?: LoadConfigFlags;
}

function readEnvOverrides(): Partial<PlatformConfig["static"]> {
  const overrides: Partial<PlatformConfig["static"]> = {};
  if (process.env.UNIVERSE_STATIC_OUTPUT_DIR) {
    overrides.output_dir = process.env.UNIVERSE_STATIC_OUTPUT_DIR;
  }
  if (process.env.UNIVERSE_STATIC_BUCKET) {
    overrides.bucket = process.env.UNIVERSE_STATIC_BUCKET;
  }
  if (process.env.UNIVERSE_STATIC_RCLONE_REMOTE) {
    overrides.rclone_remote = process.env.UNIVERSE_STATIC_RCLONE_REMOTE;
  }
  if (process.env.UNIVERSE_STATIC_REGION) {
    overrides.region = process.env.UNIVERSE_STATIC_REGION;
  }
  return overrides;
}

function readFlagOverrides(
  flags?: LoadConfigFlags,
): Partial<PlatformConfig["static"]> {
  if (!flags) return {};
  const overrides: Partial<PlatformConfig["static"]> = {};
  if (flags.outputDir) overrides.output_dir = flags.outputDir;
  if (flags.bucket) overrides.bucket = flags.bucket;
  if (flags.rcloneRemote) overrides.rclone_remote = flags.rcloneRemote;
  if (flags.region) overrides.region = flags.region;
  return overrides;
}

export function loadConfig(options: LoadConfigOptions = {}): ResolvedConfig {
  const cwd = options.cwd ?? process.cwd();
  const configPath = resolve(cwd, "platform.yaml");

  let raw: string;
  try {
    raw = readFileSync(configPath, "utf-8");
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      throw new Error(
        `platform.yaml not found at ${configPath}. See STAFF-GUIDE.md for the required format.`,
      );
    }
    throw err;
  }

  const parsed: unknown = parseYaml(raw);

  const yamlValidated = platformSchema.parse(parsed);

  const envOverrides = readEnvOverrides();
  const flagOverrides = readFlagOverrides(options.flags);

  const merged: ResolvedConfig = {
    ...yamlValidated,
    static: {
      ...yamlValidated.static,
      ...envOverrides,
      ...flagOverrides,
    },
  };

  return merged;
}
