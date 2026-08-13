import { describe, expect, it, vi } from "vitest";
import { auditLs, auditLsHandler } from "../../src/commands/audit/ls.js";
import { UsageError } from "../../src/errors.js";
import type { AuditRow, ProxyClient, ProxyClientConfig } from "../../src/lib/proxy-client.js";

const ROWS: AuditRow[] = [
  {
    id: 2,
    occurredAt: "2026-07-14T10:00:00Z",
    actor: "alice",
    action: "repo.approve",
    outcome: "success",
    detail: { name: "learn-app" },
  },
  {
    id: 1,
    occurredAt: "2026-07-14T09:00:00Z",
    actor: "bob",
    action: "site.promote",
    site: "www",
    outcome: "success",
  },
];

function mkDeps(listAudit: ReturnType<typeof vi.fn>) {
  const client = { listAudit } as unknown as ProxyClient;
  return {
    env: { UNIVERSE_PROXY_URL: "https://example.test" } as NodeJS.ProcessEnv,
    resolveIdentity: vi.fn().mockResolvedValue({ token: "t", source: "env" }),
    createProxyClient: vi.fn((_cfg: ProxyClientConfig) => client),
  };
}

describe("auditLs SDK", () => {
  it("forwards filters and returns CommandResult with table format", async () => {
    const listAudit = vi.fn().mockResolvedValue(ROWS);
    const deps = mkDeps(listAudit);

    const result = await auditLs({ actor: "alice", action: "repo.approve", limit: 10 }, deps);

    expect(listAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: "alice",
        action: "repo.approve",
        limit: 10,
      }),
    );
    expect(result.format).toContain("alice");
    expect(result.format).toContain("repo.approve");
    expect(result.format).toContain("learn-app");
    expect(result.data.command).toBe("audit ls");
    expect(result.data.count).toBe(2);
    expect(result.data.events).toHaveLength(2);
  });

  it("throws UsageError on a negative --limit", async () => {
    const listAudit = vi.fn();
    const deps = mkDeps(listAudit);
    await expect(auditLs({ limit: -1 }, deps)).rejects.toThrow(UsageError);
    expect(listAudit).not.toHaveBeenCalled();
  });

  it("keeps the deployId in TARGET for deploy-scoped rows", async () => {
    const listAudit = vi.fn().mockResolvedValue([
      {
        id: 3,
        occurredAt: "2026-07-14T11:00:00Z",
        actor: "carol",
        action: "deploy.finalize",
        site: "www",
        deployId: "20260714-110000-abc1234",
        outcome: "success",
      },
    ] satisfies AuditRow[]);
    const deps = mkDeps(listAudit);

    const result = await auditLs({}, deps);

    expect(result.format).toContain("www");
    expect(result.format).toContain("20260714-110000-abc1234");
  });
});

describe("auditLsHandler", () => {
  it("forwards filters and prints an actor-attributed table", async () => {
    const listAudit = vi.fn().mockResolvedValue(ROWS);
    const deps = mkDeps(listAudit);
    const logMessage = vi.fn();

    await auditLsHandler(
      { json: false, actor: "alice", action: "repo.approve", limit: 10 },
      { ...deps, logMessage, logError: vi.fn() },
    );

    expect(listAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: "alice",
        action: "repo.approve",
        limit: 10,
      }),
    );
    const out = logMessage.mock.calls[0]?.[0] as string;
    expect(out).toContain("alice");
    expect(out).toContain("repo.approve");
    expect(out).toContain("learn-app");
  });

  it("emits a json envelope with --json", async () => {
    const listAudit = vi.fn().mockResolvedValue(ROWS);
    const deps = mkDeps(listAudit);
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await auditLsHandler({ json: true }, deps);

    const payload = JSON.parse(write.mock.calls[0]?.[0] as string);
    expect(payload.command).toBe("audit ls");
    expect(payload.count).toBe(2);
    expect(payload.events).toHaveLength(2);
    write.mockRestore();
  });

  it("rejects a negative --limit without calling the proxy", async () => {
    const listAudit = vi.fn();
    const deps = mkDeps(listAudit);
    const exit = vi.fn();

    await auditLsHandler(
      { json: false, limit: -1 },
      { ...deps, logError: vi.fn(), exit },
    );

    expect(listAudit).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalled();
  });
});
