import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { TokenStore } from "./token-store.port.js";

/**
 * Persistent store for the device-flow GitHub token (priority chain
 * fallback #5 per ADR-016 §Identity priority chain).
 *
 * On-disk layout:
 *
 *   $XDG_CONFIG_HOME/universe-cli/token       (if XDG_CONFIG_HOME set)
 *   $HOME/.config/universe-cli/token          (fallback)
 *
 * Discipline: file mode 0600, parent dir 0700, plain text (no JSON
 * envelope). Anything more is over-engineering — the token is the
 * secret, not the surrounding metadata.
 */

const APP_DIR = "universe-cli";
const TOKEN_FILE = "token";

const configBase = (): string => {
  const xdg = process.env["XDG_CONFIG_HOME"];
  if (xdg !== undefined && xdg.length > 0) {
    return xdg;
  }
  return join(homedir(), ".config");
};

const tokenPath = (): string => join(configBase(), APP_DIR, TOKEN_FILE);

const isFileNotFound = (err: unknown): boolean =>
  typeof err === "object" &&
  err !== null &&
  "code" in err &&
  (err as { code: string }).code === "ENOENT";

class FileTokenStore implements TokenStore {
  async saveToken(token: string): Promise<void> {
    const trimmed = token.trim();
    if (trimmed.length === 0) {
      throw new Error("refusing to save empty token");
    }
    const path = tokenPath();
    const dir = dirname(path);
    await mkdir(dir, { mode: 0o700, recursive: true });
    // mkdir respects the umask on existing dirs; force 0700 explicitly.
    await chmod(dir, 0o700);
    await writeFile(path, trimmed, { mode: 0o600 });
    // writeFile honors mode only on create; chmod ensures perms on overwrite.
    await chmod(path, 0o600);
  }

  async loadToken(): Promise<string | null> {
    let raw: string;
    try {
      raw = await readFile(tokenPath(), "utf-8");
    } catch (err) {
      if (isFileNotFound(err)) {
        return null;
      }
      throw err;
    }
    const trimmed = raw.trim();
    return trimmed.length === 0 ? null : trimmed;
  }

  async deleteToken(): Promise<void> {
    await rm(tokenPath(), { force: true });
  }
}

export { FileTokenStore, tokenPath };
