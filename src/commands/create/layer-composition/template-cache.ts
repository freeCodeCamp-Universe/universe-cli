import { homedir } from "node:os";
import { join } from "node:path";

const APP_DIR = "universe-cli";
const TEMPLATES_DIR = "templates";

const cacheBase = (): string => {
  const xdg = process.env["XDG_CACHE_HOME"];
  if (xdg && xdg.length > 0) return xdg;
  return join(homedir(), ".cache");
};

const versionFromUrl = (url: string): string => {
  const filename = url.split("/").at(-1) ?? url;
  const match = filename.match(/^templates-(.+)\.tar\.gz$/);
  return match?.[1] ?? filename;
};

const templateCacheDir = (url: string): string =>
  join(cacheBase(), APP_DIR, TEMPLATES_DIR, versionFromUrl(url));

export { cacheBase, templateCacheDir, versionFromUrl };
