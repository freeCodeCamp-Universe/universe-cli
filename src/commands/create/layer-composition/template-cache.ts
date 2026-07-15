import { homedir } from "node:os";
import { join } from "node:path";

const APP_DIR = "universe-cli";
const TEMPLATES_DIR = "templates";

const cacheBase = (): string => {
  const xdg = process.env["XDG_CACHE_HOME"];
  if (xdg && xdg.length > 0) return xdg;
  return join(homedir(), ".cache");
};

const templateCacheDir = (version: string): string =>
  join(cacheBase(), APP_DIR, TEMPLATES_DIR, version);

export { cacheBase, templateCacheDir };
