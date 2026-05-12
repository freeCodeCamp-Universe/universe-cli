import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { whoami } from "../../src/commands/whoami.js";
import { type FakeArtemis, startFakeArtemis } from "./_helpers/fake-artemis.js";
import { type CliEnv, makeCliEnv } from "./_helpers/cli-env.js";

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

function captureStdout(): { read: () => string; restore: () => void } {
  const chunks: string[] = [];
  const spy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: unknown) => {
      chunks.push(String(chunk));
      return true;
    });
  return {
    read: () => chunks.join(""),
    restore: () => spy.mockRestore(),
  };
}

describe("whoami E2E (real proxy-client + real identity chain)", () => {
  let server: FakeArtemis;
  let env: CliEnv;

  beforeEach(async () => {
    server = await startFakeArtemis();
  });

  afterEach(async () => {
    await env?.cleanup();
    await server.close();
  });

  it("walks identity chain, hits real /api/whoami, emits success envelope", async () => {
    const token = "ghp_e2e_token";
    server.state.tokens.set(token, {
      login: "alice",
      authorizedSites: ["news", "certifications"],
    });
    env = await makeCliEnv({
      proxyUrl: server.url,
      githubToken: token,
    });

    const stdout = captureStdout();
    const captured: CapturedExit = {};
    const logSuccess = vi.fn();
    const logError = vi.fn();

    try {
      await whoami(
        { json: true },
        {
          env: env.env,
          exit: makeExit(captured),
          logSuccess,
          logError,
        },
      );
    } catch (err) {
      if (!(err instanceof Error) || !("__exit__" in err)) throw err;
    }
    stdout.restore();

    expect(captured.code).toBeUndefined();
    expect(logError).not.toHaveBeenCalled();

    const envelope = JSON.parse(stdout.read().trim());
    expect(envelope.command).toBe("whoami");
    expect(envelope.success).toBe(true);
    expect(envelope.login).toBe("alice");
    expect(envelope.authorizedSitesCount).toBe(2);
    expect(envelope.identitySource).toBe("env_GITHUB_TOKEN");
    expect(envelope.authorizedSites).toBeUndefined();

    expect(server.callLog).toHaveLength(1);
    const call = server.callLog[0];
    expect(call.method).toBe("GET");
    expect(call.path).toBe("/api/whoami");
    expect(call.authorization).toBe(`Bearer ${token}`);
    expect(call.status).toBe(200);
  });
});
