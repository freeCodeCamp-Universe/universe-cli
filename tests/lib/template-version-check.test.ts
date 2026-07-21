import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  checkTemplateVersion,
  fetchLatestTemplateVersion,
  formatTemplateNotice,
} from "../../src/lib/template-version-check.js";

let tmp: string;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function cachePath(): string {
  return join(tmp, "universe-cli", "templates", "template-version-check.json");
}

async function seedCache(latest: string, lastCheck: number): Promise<void> {
  const path = cachePath();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify({ latest, lastCheck }), {
    mode: 0o644,
  });
}

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "universe-cli-tpl-"));
  vi.stubEnv("XDG_CACHE_HOME", tmp);
  vi.unstubAllEnvs();
  vi.stubEnv("XDG_CACHE_HOME", tmp);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await rm(tmp, { recursive: true, force: true });
});

describe("fetchLatestTemplateVersion", () => {
  it("returns version from tag_name on 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(jsonResponse(200, { tag_name: "app-templates-v0.3.0" })),
    );
    expect(await fetchLatestTemplateVersion()).toBe("0.3.0");
  });

  it("returns null on non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse(404, {})));
    expect(await fetchLatestTemplateVersion()).toBeNull();
  });

  it("returns null on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("ECONNREFUSED")));
    expect(await fetchLatestTemplateVersion()).toBeNull();
  });

  it("returns null when tag_name missing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse(200, { name: "foo" })));
    expect(await fetchLatestTemplateVersion()).toBeNull();
  });

  it("returns null when tag_name has wrong prefix", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(jsonResponse(200, { tag_name: "v1.0.0" })),
    );
    expect(await fetchLatestTemplateVersion()).toBeNull();
  });

  it("sends accept header for GitHub API", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { tag_name: "app-templates-v0.3.0" }));
    vi.stubGlobal("fetch", fetchMock);
    await fetchLatestTemplateVersion();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["accept"]).toBe("application/vnd.github+json");
  });
});

describe("checkTemplateVersion", () => {
  it("returns null when disabled", async () => {
    vi.stubEnv("UNIVERSE_NO_UPDATE_CHECK", "1");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await checkTemplateVersion("0.2.0")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns notice when current < latest (fresh fetch)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(jsonResponse(200, { tag_name: "app-templates-v0.3.0" })),
    );
    const now = 1_000_000_000_000;
    const notice = await checkTemplateVersion("0.2.0", now);
    expect(notice).toEqual({ current: "0.2.0", latest: "0.3.0" });
  });

  it("returns null when current >= latest", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(jsonResponse(200, { tag_name: "app-templates-v0.2.0" })),
    );
    expect(await checkTemplateVersion("0.2.0")).toBeNull();
  });

  it("returns null when fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("network")));
    expect(await checkTemplateVersion("0.2.0")).toBeNull();
  });

  it("writes cache after successful fetch", async () => {
    const now = 1_000_000_000_000;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(jsonResponse(200, { tag_name: "app-templates-v0.3.0" })),
    );
    await checkTemplateVersion("0.2.0", now);
    const raw = await readFile(cachePath(), "utf-8");
    expect(JSON.parse(raw)).toEqual({ latest: "0.3.0", lastCheck: now });
  });

  it("does not write cache when fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("network")));
    await checkTemplateVersion("0.2.0");
    await expect(readFile(cachePath(), "utf-8")).rejects.toThrow();
  });

  it("skips fetch when cache is fresh (< TTL)", async () => {
    const now = 1_000_000_000_000;
    await seedCache("0.3.0", now - 60_000);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const notice = await checkTemplateVersion("0.2.0", now);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(notice).toEqual({ current: "0.2.0", latest: "0.3.0" });
  });

  it("returns null from fresh cache when current >= cached latest", async () => {
    const now = 1_000_000_000_000;
    await seedCache("0.2.0", now - 60_000);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await checkTemplateVersion("0.2.0", now)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches when cache is stale (> TTL)", async () => {
    const now = 1_000_000_000_000;
    const day = 24 * 60 * 60 * 1000;
    await seedCache("0.2.0", now - day - 1);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(jsonResponse(200, { tag_name: "app-templates-v0.4.0" })),
    );
    const notice = await checkTemplateVersion("0.2.0", now);
    expect(notice).toEqual({ current: "0.2.0", latest: "0.4.0" });
    const raw = await readFile(cachePath(), "utf-8");
    expect(JSON.parse(raw)).toEqual({ latest: "0.4.0", lastCheck: now });
  });

  it("respects UNIVERSE_UPDATE_TTL_MS override", async () => {
    const now = 1_000_000_000_000;
    vi.stubEnv("UNIVERSE_UPDATE_TTL_MS", String(10 * 60 * 1000));
    await seedCache("0.3.0", now - 5 * 60 * 1000);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await checkTemplateVersion("0.2.0", now);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("formatTemplateNotice", () => {
  it("renders clack-style frame with versions (plain)", () => {
    expect(formatTemplateNotice({ current: "0.2.0", latest: "0.3.0" }, false)).toBe(
      [
        "",
        "│",
        "▲  Newer templates available: 0.2.0 → 0.3.0",
        "│  Set UNIVERSE_TEMPLATES_VERSION=0.3.0 to use them.",
        "└",
        "",
      ].join("\n"),
    );
  });

  it("emits ANSI escape sequences when color enabled", () => {
    const out = formatTemplateNotice({ current: "0.2.0", latest: "0.3.0" }, true);
    expect(out).toContain("\x1b[");
    expect(out).toContain("0.2.0");
    expect(out).toContain("0.3.0");
  });
});
