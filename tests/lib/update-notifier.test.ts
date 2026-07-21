import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { writeSync } from "node:fs";
import {
  cachePath,
  compareVersions,
  fetchLatest,
  formatNotice,
  getNoticeSync,
  isDisabled,
  installExitNotice,
  readCache,
  refreshIfStale,
  REFRESH_ENV,
  runRefreshWorker,
  spawnRefresh,
} from "../../src/lib/update-notifier.js";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, spawn: vi.fn(() => ({ unref: vi.fn() })) };
});

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, writeSync: vi.fn() };
});

const mockSpawn = vi.mocked(spawn);
const mockWriteSync = vi.mocked(writeSync);

let tmp: string;
const origXdg = process.env["XDG_CONFIG_HOME"];
const origHome = process.env["HOME"];
const origDisable = process.env["UNIVERSE_NO_UPDATE_CHECK"];
const origTtl = process.env["UNIVERSE_UPDATE_TTL_MS"];
const origUrl = process.env["UNIVERSE_UPDATE_URL"];

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function seedCache(latest: string, lastCheck: number): Promise<void> {
  const path = cachePath();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify({ latest, lastCheck }), {
    mode: 0o644,
  });
}

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "universe-cli-upd-"));
  process.env["XDG_CONFIG_HOME"] = tmp;
  delete process.env["UNIVERSE_NO_UPDATE_CHECK"];
  delete process.env["UNIVERSE_UPDATE_TTL_MS"];
  delete process.env["UNIVERSE_UPDATE_URL"];
  mockSpawn.mockClear();
});

afterEach(async () => {
  if (origXdg === undefined) delete process.env["XDG_CONFIG_HOME"];
  else process.env["XDG_CONFIG_HOME"] = origXdg;
  if (origHome !== undefined) process.env["HOME"] = origHome;
  if (origDisable === undefined) delete process.env["UNIVERSE_NO_UPDATE_CHECK"];
  else process.env["UNIVERSE_NO_UPDATE_CHECK"] = origDisable;
  if (origTtl === undefined) delete process.env["UNIVERSE_UPDATE_TTL_MS"];
  else process.env["UNIVERSE_UPDATE_TTL_MS"] = origTtl;
  if (origUrl === undefined) delete process.env["UNIVERSE_UPDATE_URL"];
  else process.env["UNIVERSE_UPDATE_URL"] = origUrl;
  vi.unstubAllGlobals();
  await rm(tmp, { recursive: true, force: true });
});

describe("cachePath", () => {
  it("uses $XDG_CONFIG_HOME/universe-cli/update-check.json when set", () => {
    expect(cachePath()).toBe(join(tmp, "universe-cli", "update-check.json"));
  });

  it("falls back to $HOME/.config/... when XDG unset", () => {
    delete process.env["XDG_CONFIG_HOME"];
    process.env["HOME"] = tmp;
    expect(cachePath()).toBe(join(tmp, ".config", "universe-cli", "update-check.json"));
  });
});

describe("isDisabled", () => {
  it("returns false when env var unset", () => {
    expect(isDisabled()).toBe(false);
  });

  it("returns true when env var is '1'", () => {
    process.env["UNIVERSE_NO_UPDATE_CHECK"] = "1";
    expect(isDisabled()).toBe(true);
  });

  it("returns true when env var is 'true'", () => {
    process.env["UNIVERSE_NO_UPDATE_CHECK"] = "true";
    expect(isDisabled()).toBe(true);
  });

  it("returns false when env var is 'false'", () => {
    process.env["UNIVERSE_NO_UPDATE_CHECK"] = "false";
    expect(isDisabled()).toBe(false);
  });
});

describe("compareVersions", () => {
  it("returns -1 when first is older", () => {
    expect(compareVersions("0.7.0", "0.8.0")).toBe(-1);
  });

  it("returns 1 when first is newer", () => {
    expect(compareVersions("1.0.0", "0.9.9")).toBe(1);
  });

  it("returns 0 when equal", () => {
    expect(compareVersions("0.7.0", "0.7.0")).toBe(0);
  });

  it("compares minor versions correctly", () => {
    expect(compareVersions("0.7.5", "0.7.10")).toBe(-1);
  });

  it("treats prerelease as equal to its release core", () => {
    expect(compareVersions("0.7.0-rc.1", "0.7.0")).toBe(0);
  });

  it("returns 0 on malformed input", () => {
    expect(compareVersions("not-a-version", "0.7.0")).toBe(0);
  });

  it("returns 0 on partial input", () => {
    expect(compareVersions("0.7", "0.7.0")).toBe(0);
  });
});

describe("readCache", () => {
  it("returns null when file missing", async () => {
    expect(await readCache()).toBeNull();
  });

  it("returns parsed cache when file valid", async () => {
    await seedCache("0.8.0", 1234567890);
    expect(await readCache()).toEqual({
      latest: "0.8.0",
      lastCheck: 1234567890,
    });
  });

  it("returns null on malformed JSON", async () => {
    const path = cachePath();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "not json", { mode: 0o644 });
    expect(await readCache()).toBeNull();
  });

  it("returns null when latest field is wrong type", async () => {
    const path = cachePath();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify({ latest: 42, lastCheck: 1 }), {
      mode: 0o644,
    });
    expect(await readCache()).toBeNull();
  });
});

describe("fetchLatest", () => {
  it("returns version string on 200 with valid body", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(200, { version: "0.8.0" }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchLatest()).toBe("0.8.0");
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://registry.npmjs.org/@freecodecamp/universe-cli/latest");
  });

  it("returns null on non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse(500, {})));
    expect(await fetchLatest()).toBeNull();
  });

  it("returns null on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("ECONNREFUSED")));
    expect(await fetchLatest()).toBeNull();
  });

  it("returns null when body has no version field", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse(200, { name: "foo" })));
    expect(await fetchLatest()).toBeNull();
  });
});

describe("refreshIfStale", () => {
  it("skips fetch when disabled", async () => {
    process.env["UNIVERSE_NO_UPDATE_CHECK"] = "1";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await refreshIfStale();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips fetch when cache is fresh (< TTL)", async () => {
    const now = 1_000_000_000_000;
    await seedCache("0.8.0", now - 60_000);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await refreshIfStale(now);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches when cache is stale (> TTL)", async () => {
    const now = 1_000_000_000_000;
    const day = 24 * 60 * 60 * 1000;
    await seedCache("0.7.0", now - day - 1);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse(200, { version: "0.9.0" })));
    await refreshIfStale(now);
    const cache = await readCache();
    expect(cache).toEqual({ latest: "0.9.0", lastCheck: now });
  });

  it("fetches when no cache file exists", async () => {
    const now = 1_000_000_000_000;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse(200, { version: "0.9.0" })));
    await refreshIfStale(now);
    const cache = await readCache();
    expect(cache).toEqual({ latest: "0.9.0", lastCheck: now });
  });

  it("with force: true, fetches even when cache is fresh (< TTL)", async () => {
    const now = 1_000_000_000_000;
    await seedCache("0.8.0", now - 60_000);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse(200, { version: "0.9.0" })));
    await refreshIfStale(now, { force: true });
    expect(await readCache()).toEqual({ latest: "0.9.0", lastCheck: now });
  });

  it("with force: true, still skips when disabled", async () => {
    process.env["UNIVERSE_NO_UPDATE_CHECK"] = "1";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await refreshIfStale(1_000_000_000_000, { force: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips fetch when cache age is just under the 1h TTL", async () => {
    const now = 1_000_000_000_000;
    const oneHour = 60 * 60 * 1000;
    await seedCache("0.8.0", now - oneHour + 1000);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await refreshIfStale(now);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches when cache age just exceeds the 1h TTL", async () => {
    const now = 1_000_000_000_000;
    const oneHour = 60 * 60 * 1000;
    await seedCache("0.7.0", now - oneHour - 1000);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse(200, { version: "0.9.0" })));
    await refreshIfStale(now);
    expect(await readCache()).toEqual({ latest: "0.9.0", lastCheck: now });
  });

  it("does not write cache when fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("network")));
    await refreshIfStale();
    expect(await readCache()).toBeNull();
  });

  it("writes cache file with 0644 mode", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse(200, { version: "0.9.0" })));
    await refreshIfStale();
    const raw = await readFile(cachePath(), "utf-8");
    expect(JSON.parse(raw)).toHaveProperty("latest", "0.9.0");
  });
});

describe("getNoticeSync", () => {
  it("returns null when disabled", async () => {
    process.env["UNIVERSE_NO_UPDATE_CHECK"] = "1";
    await seedCache("0.8.0", Date.now());
    expect(getNoticeSync("0.7.0")).toBeNull();
  });

  it("returns null when no cache", () => {
    expect(getNoticeSync("0.7.0")).toBeNull();
  });

  it("returns null when current is already at latest", async () => {
    await seedCache("0.7.0", Date.now());
    expect(getNoticeSync("0.7.0")).toBeNull();
  });

  it("returns null when current is newer than cached latest", async () => {
    await seedCache("0.7.0", Date.now());
    expect(getNoticeSync("0.8.0")).toBeNull();
  });

  it("returns notice when current is older than cached latest", async () => {
    await seedCache("0.8.0", Date.now());
    expect(getNoticeSync("0.7.0")).toEqual({
      current: "0.7.0",
      latest: "0.8.0",
    });
  });
});

describe("formatNotice", () => {
  it("renders clack-style frame with versions and install hint (plain)", () => {
    expect(formatNotice({ current: "0.7.0", latest: "0.8.0" }, false)).toBe(
      [
        "",
        "│",
        "▲  Update available: 0.7.0 → 0.8.0",
        "│  Run npm i -g @freecodecamp/universe-cli to upgrade",
        "└",
        "",
      ].join("\n"),
    );
  });

  it("emits ANSI escape sequences when color enabled", () => {
    const out = formatNotice({ current: "0.7.0", latest: "0.8.0" }, true);
    expect(out).toContain("\x1b[");
    expect(out).toContain("0.7.0");
    expect(out).toContain("0.8.0");
  });
});

describe("UNIVERSE_UPDATE_TTL_MS override", () => {
  it("skips fetch when cache age is under the overridden TTL", async () => {
    const now = 1_000_000_000_000;
    process.env["UNIVERSE_UPDATE_TTL_MS"] = String(10 * 60 * 1000);
    await seedCache("0.8.0", now - 5 * 60 * 1000);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await refreshIfStale(now);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches when cache age exceeds the overridden TTL", async () => {
    const now = 1_000_000_000_000;
    process.env["UNIVERSE_UPDATE_TTL_MS"] = String(10 * 60 * 1000);
    await seedCache("0.7.0", now - 20 * 60 * 1000);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse(200, { version: "0.9.0" })));
    await refreshIfStale(now);
    expect(await readCache()).toEqual({ latest: "0.9.0", lastCheck: now });
  });

  it("ignores a non-numeric override and uses the default", async () => {
    const now = 1_000_000_000_000;
    process.env["UNIVERSE_UPDATE_TTL_MS"] = "garbage";
    await seedCache("0.8.0", now - 30 * 60 * 1000);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await refreshIfStale(now);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("UNIVERSE_UPDATE_URL override", () => {
  it("fetches from the overridden URL", async () => {
    process.env["UNIVERSE_UPDATE_URL"] = "https://example.test/latest";
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(200, { version: "3.0.0" }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchLatest()).toBe("3.0.0");
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.test/latest");
  });
});

describe("spawnRefresh", () => {
  const now = 1_000_000_000_000;

  it("does not spawn when disabled", () => {
    process.env["UNIVERSE_NO_UPDATE_CHECK"] = "1";
    spawnRefresh(now);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("does not spawn when cache is fresh", async () => {
    await seedCache("0.8.0", now - 60_000);
    spawnRefresh(now);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("spawns a detached worker (env signal, entry script) when stale", async () => {
    await seedCache("0.8.0", now - 2 * 60 * 60 * 1000);
    spawnRefresh(now);
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const [, args, opts] = mockSpawn.mock.calls[0] as [
      string,
      string[],
      { detached?: boolean; stdio?: string; env?: NodeJS.ProcessEnv },
    ];
    expect(opts).toMatchObject({ detached: true, stdio: "ignore" });
    expect(opts.env?.[REFRESH_ENV]).toBe("1");
    if (process.argv[1]) expect(args[0]).toBe(process.argv[1]);
  });

  it("spawns when no cache exists", () => {
    spawnRefresh(now);
    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });

  it("unrefs the child so the parent can exit", async () => {
    await seedCache("0.8.0", now - 2 * 60 * 60 * 1000);
    spawnRefresh(now);
    const child = mockSpawn.mock.results[0]?.value as { unref: () => void };
    expect(child.unref).toHaveBeenCalled();
  });

  it("swallows a spawn failure without throwing", async () => {
    await seedCache("0.8.0", now - 2 * 60 * 60 * 1000);
    mockSpawn.mockImplementationOnce(() => {
      throw new Error("EAGAIN");
    });
    expect(() => spawnRefresh(now)).not.toThrow();
  });
});

describe("runRefreshWorker", () => {
  it("force-refreshes even when cache is fresh", async () => {
    await seedCache("0.8.0", Date.now() - 60_000);
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(200, { version: "0.9.0" }));
    vi.stubGlobal("fetch", fetchMock);
    await runRefreshWorker();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await readCache())?.latest).toBe("0.9.0");
  });

  it("skips when disabled", async () => {
    process.env["UNIVERSE_NO_UPDATE_CHECK"] = "1";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await runRefreshWorker();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("installExitNotice", () => {
  let handlers: Record<string, () => void>;
  let onSpy: ReturnType<typeof vi.spyOn>;

  function capture(current: string): void {
    handlers = {};
    onSpy = vi
      .spyOn(process, "on")
      .mockImplementation((ev: string | symbol, fn: (...a: never[]) => void) => {
        handlers[String(ev)] = fn as () => void;
        return process;
      });
    installExitNotice(current);
    onSpy.mockRestore();
  }

  beforeEach(() => mockWriteSync.mockClear());

  it("writes the notice once across both hooks (printed guard)", async () => {
    await seedCache("0.8.0", Date.now());
    capture("0.7.0");
    handlers["exit"]?.();
    handlers["beforeExit"]?.();
    expect(mockWriteSync).toHaveBeenCalledTimes(1);
    expect(mockWriteSync.mock.calls[0]?.[0]).toBe(2);
  });

  it("does not register or write when disabled", () => {
    process.env["UNIVERSE_NO_UPDATE_CHECK"] = "1";
    capture("0.7.0");
    expect(handlers["exit"]).toBeUndefined();
    expect(mockWriteSync).not.toHaveBeenCalled();
  });

  it("writes nothing when current is already latest", async () => {
    await seedCache("0.7.0", Date.now());
    capture("0.7.0");
    handlers["exit"]?.();
    expect(mockWriteSync).not.toHaveBeenCalled();
  });

  it("does not propagate when writeSync throws", async () => {
    await seedCache("0.8.0", Date.now());
    mockWriteSync.mockImplementationOnce(() => {
      throw new Error("EBADF");
    });
    capture("0.7.0");
    expect(() => handlers["exit"]?.()).not.toThrow();
  });
});
