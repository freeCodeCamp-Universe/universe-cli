import { homedir } from "node:os";
import { join } from "node:path";

const APP_DIR = "universe-cli";
const TEMPLATES_DIR = "templates";

const templatesCache = (): string => {
  const xdg = process.env["XDG_CACHE_HOME"];
  const base = xdg && xdg.length > 0 ? xdg : join(homedir(), ".cache");
  return join(base, APP_DIR, TEMPLATES_DIR);
};

export { templatesCache };
