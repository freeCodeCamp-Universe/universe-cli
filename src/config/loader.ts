import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { parse as parseYaml } from "yaml";
import { ConfigError } from "../errors.js";
import { platformSchema, type PlatformConfig } from "./schema.js";

function assertSafeOutputDir(outputDir: string, cwd: string): void {
  if (isAbsolute(outputDir)) {
    throw new ConfigError(
      `output_dir must be relative to the project root; absolute paths are rejected: ${outputDir}`,
    );
  }
  const resolved = resolve(cwd, outputDir);
  const rel = relative(cwd, resolved);
  if (rel === "..") {
    throw new ConfigError(
      `output_dir resolves outside the project root: ${outputDir}`,
    );
  }
  if (rel.startsWith(`..${sep}`)) {
    throw new ConfigError(
      `output_dir resolves outside the project root: ${outputDir}`,
    );
  }
}

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
      throw new ConfigError(
        `platform.yaml not found at ${configPath}. See docs/STAFF-GUIDE.md for the required format.`,
      );
    }
    throw err;
  }

  const parsed: unknown = parseYaml(raw);

  const parseResult = platformSchema.safeParse(parsed);
  if (!parseResult.success) {
    const issues = parseResult.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
        return `  - ${path}: ${issue.message}`;
      })
      .join("\n");
    throw new ConfigError(
      `platform.yaml is invalid:\n${issues}\nSee docs/STAFF-GUIDE.md for the required format.`,
    );
  }
  const yamlValidated = parseResult.data;

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

  assertSafeOutputDir(merged.static.output_dir, cwd);

  return merged;
}
