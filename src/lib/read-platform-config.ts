import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ConfigError } from "../errors.js";
import { parsePlatformYaml, type PlatformYamlV2 } from "./platform-yaml.js";

const defaultReadPlatformYaml = async (cwd: string): Promise<string> => {
  return readFile(resolve(cwd, "platform.yaml"), "utf-8");
};

async function readAndParseConfig(
  cwd: string,
  read: (cwd: string) => Promise<string>,
): Promise<PlatformYamlV2> {
  let raw: string;
  try {
    raw = await read(cwd);
  } catch (err) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new ConfigError(`platform.yaml not found in ${cwd}. See docs/platform-yaml.md.`);
    }
    throw err;
  }
  const r = parsePlatformYaml(raw);
  if (!r.ok) throw new ConfigError(r.error);
  return r.value;
}

export { defaultReadPlatformYaml, readAndParseConfig };
