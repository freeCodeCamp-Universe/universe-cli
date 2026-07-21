import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { approve } from "../../src/commands/repo/approve.js";
import { create } from "../../src/commands/repo/create.js";
import { ls } from "../../src/commands/repo/ls.js";
import { reject } from "../../src/commands/repo/reject.js";
import { rm } from "../../src/commands/repo/rm.js";
import { status } from "../../src/commands/repo/status.js";
import { type CliEnv, makeCliEnv } from "./_helpers/cli-env.js";
import { type FakeArtemis, startFakeArtemis } from "./_helpers/fake-artemis.js";

interface CapturedExit {
  code?: number;
}

function makeExit(captured: CapturedExit): (code: number) => never {
  return (code: number) => {
    captured.code = code;
    const err = new Error("__exit__") as Error & { __exit__: true };
    err.__exit__ = true;
    throw err;
  };
}

type Envelope = Record<string, unknown>;

async function run(
  fn: (options: never, deps: never) => Promise<void>,
  options: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
): Promise<{ captured: CapturedExit; envelope: Envelope | undefined }> {
  const chunks: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    chunks.push(String(chunk));
    return true;
  });
  const captured: CapturedExit = {};
  try {
    await fn(
      options as never,
      {
        env,
        exit: makeExit(captured),
        logSuccess: vi.fn(),
        logError: vi.fn(),
        logMessage: vi.fn(),
      } as never,
    );
  } catch (err) {
    if (!(err instanceof Error) || !("__exit__" in err)) throw err;
  }
  spy.mockRestore();
  const raw = chunks.join("").trim();
  return {
    captured,
    envelope: raw.length > 0 ? (JSON.parse(raw) as Envelope) : undefined,
  };
}

describe("repo E2E (real proxy-client + real identity chain)", () => {
  let server: FakeArtemis;
  let env: CliEnv;
  const token = "ghp_e2e_repo";

  beforeEach(async () => {
    server = await startFakeArtemis();
    server.state.tokens.set(token, { login: "alice", authorizedSites: [] });
    env = await makeCliEnv({ proxyUrl: server.url, githubToken: token });
  });

  afterEach(async () => {
    await env?.cleanup();
    await server.close();
  });

  it("runs the create → ls → approve → status lifecycle", async () => {
    const created = await run(
      create as never,
      { json: true, name: "learn-python-rpg", visibility: "private" },
      env.env,
    );
    expect(created.captured.code).toBeUndefined();
    expect(created.envelope!["status"]).toBe("pending");
    const id = created.envelope!["id"] as string;
    expect(id).toMatch(/^req_/);

    const listed = await run(ls as never, { json: true }, env.env);
    expect(listed.envelope!["count"]).toBe(1);
    expect(listed.envelope!["status"]).toBe("pending");
    const requests = listed.envelope!["requests"] as Array<{ name: string }>;
    expect(requests[0].name).toBe("learn-python-rpg");

    const approved = await run(approve as never, { json: true, id }, env.env);
    expect(approved.captured.code).toBeUndefined();
    expect(approved.envelope!["outcome"]).toBe("ok");
    const reqRow = approved.envelope!["repo"];
    expect(reqRow).toBe("freeCodeCamp-Universe/learn-python-rpg");

    const got = await run(status as never, { json: true, id }, env.env);
    const request = got.envelope!["request"] as { status: string; url: string };
    expect(request.status).toBe("active");
    expect(request.url).toContain("learn-python-rpg");
    expect(server.state.repoRequests.get(id)!.status).toBe("active");
  });

  it("rejects a pending request with a reason", async () => {
    const created = await run(create as never, { json: true, name: "scratch" }, env.env);
    const id = created.envelope!["id"] as string;

    const rejected = await run(
      reject as never,
      { json: true, id, reason: "out of scope" },
      env.env,
    );
    expect(rejected.captured.code).toBeUndefined();
    expect(rejected.envelope!["status"]).toBe("rejected");
    expect(rejected.envelope!["rejectReason"]).toBe("out of scope");
  });

  it("dedupes repo names case-insensitively (EXIT_USAGE on the dup)", async () => {
    const first = await run(create as never, { json: true, name: "MyRepo" }, env.env);
    expect(first.captured.code).toBeUndefined();

    const dup = await run(create as never, { json: true, name: "myrepo" }, env.env);
    expect(dup.captured.code).toBe(10); // EXIT_USAGE
    const errorBlock = dup.envelope!["error"] as { message: string };
    expect(errorBlock.message).toContain("already_exists");
  });

  it("deletes a request, freeing the name to re-create", async () => {
    const created = await run(create as never, { json: true, name: "tmp-del" }, env.env);
    const id = created.envelope!["id"] as string;

    const removed = await run(rm as never, { json: true, id }, env.env);
    expect(removed.captured.code).toBeUndefined();
    expect(removed.envelope!["deleted"]).toBe(true);
    expect(server.state.repoRequests.has(id)).toBe(false);

    const again = await run(create as never, { json: true, name: "tmp-del" }, env.env);
    expect(again.captured.code).toBeUndefined();
    expect(again.envelope!["status"]).toBe("pending");
  });

  it("returns 409 already_resolved on a double approval (EXIT_USAGE)", async () => {
    const created = await run(create as never, { json: true, name: "raced" }, env.env);
    const id = created.envelope!["id"] as string;

    const first = await run(approve as never, { json: true, id }, env.env);
    expect(first.captured.code).toBeUndefined();

    const second = await run(approve as never, { json: true, id }, env.env);
    expect(second.captured.code).toBe(10);
    const errorBlock = second.envelope!["error"] as { message: string };
    expect(errorBlock.message).toContain("already_resolved");
  });
});
