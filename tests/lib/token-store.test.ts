import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  deleteToken,
  loadToken,
  saveToken,
  tokenPath,
} from "../../src/lib/token-store.js";

let tmp: string;
const origXdg = process.env["XDG_CONFIG_HOME"];
const origHome = process.env["HOME"];

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "universe-cli-token-"));
  process.env["XDG_CONFIG_HOME"] = tmp;
});

afterEach(async () => {
  if (origXdg === undefined) delete process.env["XDG_CONFIG_HOME"];
  else process.env["XDG_CONFIG_HOME"] = origXdg;
  if (origHome !== undefined) process.env["HOME"] = origHome;
  await rm(tmp, { recursive: true, force: true });
});

describe("tokenPath", () => {
  it("uses $XDG_CONFIG_HOME/universe-cli/token when set", () => {
    expect(tokenPath()).toBe(join(tmp, "universe-cli", "token"));
  });

  it("falls back to $HOME/.config/universe-cli/token when XDG unset", () => {
    delete process.env["XDG_CONFIG_HOME"];
    process.env["HOME"] = tmp;
    expect(tokenPath()).toBe(join(tmp, ".config", "universe-cli", "token"));
  });
});

describe("saveToken", () => {
  it("creates parent directory and writes token", async () => {
    await saveToken("ghp_secret");
    const path = tokenPath();
    const contents = await readFile(path, "utf-8");
    expect(contents).toBe("ghp_secret");
  });

  it("writes file with 0600 permissions", async () => {
    await saveToken("ghp_secret");
    const st = await stat(tokenPath());
    // Mask to lower 9 perm bits.
    expect(st.mode & 0o777).toBe(0o600);
  });

  it("creates parent directory with 0700 permissions", async () => {
    await saveToken("ghp_secret");
    const dirSt = await stat(join(tmp, "universe-cli"));
    expect(dirSt.mode & 0o777).toBe(0o700);
  });

  it("overwrites existing token", async () => {
    await saveToken("old");
    await saveToken("new");
    const contents = await readFile(tokenPath(), "utf-8");
    expect(contents).toBe("new");
  });

  it("trims surrounding whitespace before writing", async () => {
    await saveToken("  ghp_secret\n");
    const contents = await readFile(tokenPath(), "utf-8");
    expect(contents).toBe("ghp_secret");
  });

  it("rejects empty token", async () => {
    await expect(saveToken("")).rejects.toThrow(/empty/i);
  });

  it("rejects whitespace-only token", async () => {
    await expect(saveToken("   \n\t")).rejects.toThrow(/empty/i);
  });
});

describe("loadToken", () => {
  it("returns null when file does not exist", async () => {
    expect(await loadToken()).toBeNull();
  });

  it("returns the saved token", async () => {
    await saveToken("ghp_secret");
    expect(await loadToken()).toBe("ghp_secret");
  });

  it("trims trailing newline from disk", async () => {
    await saveToken("ghp_secret");
    // Append a newline directly.
    await writeFile(tokenPath(), "ghp_secret\n", { mode: 0o600 });
    expect(await loadToken()).toBe("ghp_secret");
  });

  it("returns null when token file is empty", async () => {
    await saveToken("ghp_secret");
    await writeFile(tokenPath(), "", { mode: 0o600 });
    expect(await loadToken()).toBeNull();
  });
});

describe("deleteToken", () => {
  it("removes the token file", async () => {
    await saveToken("ghp_secret");
    await deleteToken();
    expect(await loadToken()).toBeNull();
  });

  it("is idempotent when token file missing", async () => {
    await expect(deleteToken()).resolves.toBeUndefined();
    await expect(deleteToken()).resolves.toBeUndefined();
  });
});
