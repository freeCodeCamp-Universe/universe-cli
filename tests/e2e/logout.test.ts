import { stat } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logout } from "../../src/commands/logout.js";
import { type CliEnv, makeCliEnv } from "./_helpers/cli-env.js";

interface RunResult {
  envelope: Record<string, unknown>;
}

async function runLogoutJson(): Promise<RunResult> {
  const chunks: string[] = [];
  const spy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: unknown) => {
      chunks.push(String(chunk));
      return true;
    });
  await logout({ json: true }, { logSuccess: vi.fn(), logInfo: vi.fn() });
  spy.mockRestore();
  const raw = chunks.join("").trim();
  return { envelope: JSON.parse(raw) as Record<string, unknown> };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

describe("logout E2E (token file removed from tmp XDG)", () => {
  let env: CliEnv;

  beforeEach(() => {});

  afterEach(async () => {
    vi.unstubAllEnvs();
    await env?.cleanup();
  });

  it("removes the stored token file and reports removed=true", async () => {
    env = await makeCliEnv({
      proxyUrl: "http://unused.invalid",
      seedToken: "ghp_to_remove",
    });
    vi.stubEnv("XDG_CONFIG_HOME", env.xdgDir);
    const tokenPath = join(env.xdgDir, "universe-cli", "token");
    expect(await fileExists(tokenPath)).toBe(true);

    const r = await runLogoutJson();

    expect(r.envelope["command"]).toBe("logout");
    expect(r.envelope["success"]).toBe(true);
    expect(r.envelope["removed"]).toBe(true);
    expect(await fileExists(tokenPath)).toBe(false);
  });

  it("is idempotent — second logout reports removed=false", async () => {
    env = await makeCliEnv({ proxyUrl: "http://unused.invalid" });
    vi.stubEnv("XDG_CONFIG_HOME", env.xdgDir);

    const r = await runLogoutJson();

    expect(r.envelope["command"]).toBe("logout");
    expect(r.envelope["success"]).toBe(true);
    expect(r.envelope["removed"]).toBe(false);
  });
});
