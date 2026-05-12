import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { login } from "../../src/commands/login.js";
import { runDeviceFlow as realRunDeviceFlow } from "../../src/lib/device-flow.js";
import { type CliEnv, makeCliEnv } from "./_helpers/cli-env.js";
import { type FakeGithub, startFakeGithub } from "./_helpers/fake-github.js";

interface CapturedExit {
  code?: number;
}

interface ExitCalled extends Error {
  __exit__: true;
}

function makeExit(captured: CapturedExit): (code: number) => never {
  return (code: number) => {
    captured.code = code;
    const err = new Error("__exit__") as ExitCalled;
    err.__exit__ = true;
    throw err;
  };
}

describe("login E2E (real device-flow loop, token persisted to tmp XDG)", () => {
  let github: FakeGithub;
  let env: CliEnv;

  beforeEach(async () => {
    github = await startFakeGithub();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await env?.cleanup();
    await github.close();
  });

  // token-store reads process.env.XDG_CONFIG_HOME directly (no deps
  // injection point), so the only honest E2E for login is to redirect
  // it via vitest's per-test stubbing (cleared in afterEach). Other
  // E2Es satisfy SPEC §V8 via cli-env's deps.env; login is special.

  it("polls fake github, persists access_token to $XDG_CONFIG_HOME", async () => {
    env = await makeCliEnv({ proxyUrl: "http://unused.invalid" });
    vi.stubEnv("XDG_CONFIG_HOME", env.xdgDir);

    const stdout: string[] = [];
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: unknown) => {
        stdout.push(String(chunk));
        return true;
      });
    const captured: CapturedExit = {};
    const fastSleep = (_ms: number): Promise<void> => Promise.resolve();
    const fetchOverride = github.rewriteFetch();

    try {
      await login(
        { json: true, force: false },
        {
          env: env.env,
          exit: makeExit(captured),
          logSuccess: vi.fn(),
          logInfo: vi.fn(),
          logError: vi.fn(),
          runDeviceFlow: (opts) =>
            realRunDeviceFlow({
              ...opts,
              fetch: fetchOverride,
              sleep: fastSleep,
            }),
        },
      );
    } catch (err) {
      if (!(err instanceof Error) || !("__exit__" in err)) throw err;
    }
    spy.mockRestore();

    expect(captured.code).toBeUndefined();

    const lines = stdout
      .join("")
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => JSON.parse(s) as Record<string, unknown>);
    expect(lines).toHaveLength(2);
    expect(lines[0]["userCode"]).toBe(github.state.userCode);
    expect(lines[0]["verificationUri"]).toBe("https://github.com/login/device");
    expect(lines[0]["stored"]).toBe(false);
    expect(lines[1]["success"]).toBe(true);
    expect(lines[1]["stored"]).toBe(true);

    const tokenPath = join(env.xdgDir, "universe-cli", "token");
    const fileStat = await stat(tokenPath);
    expect(fileStat.isFile()).toBe(true);
    const onDisk = (await readFile(tokenPath, "utf-8")).trim();
    expect(onDisk).toBe(github.state.accessToken);

    expect(github.state.pollCount).toBe(2);
  });

  it("exits EXIT_CONFIRM when token already exists and --force is not set", async () => {
    env = await makeCliEnv({
      proxyUrl: "http://unused.invalid",
      seedToken: "ghp_existing_token",
    });
    vi.stubEnv("XDG_CONFIG_HOME", env.xdgDir);

    const stdout: string[] = [];
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: unknown) => {
        stdout.push(String(chunk));
        return true;
      });
    const captured: CapturedExit = {};

    try {
      await login(
        { json: true, force: false },
        {
          env: env.env,
          exit: makeExit(captured),
          logSuccess: vi.fn(),
          logInfo: vi.fn(),
          logError: vi.fn(),
          runDeviceFlow: () =>
            Promise.reject(new Error("device flow should not run")),
        },
      );
    } catch (err) {
      if (!(err instanceof Error) || !("__exit__" in err)) throw err;
    }
    spy.mockRestore();

    expect(captured.code).toBe(18);
    const env0 = JSON.parse(stdout.join("").trim()) as Record<string, unknown>;
    expect(env0["success"]).toBe(false);
    const errorBlock = env0["error"] as { code: number; message: string };
    expect(errorBlock.code).toBe(18);
    expect(errorBlock.message).toContain("Already logged in");
  });
});
