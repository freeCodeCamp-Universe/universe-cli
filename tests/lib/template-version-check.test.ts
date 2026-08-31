import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

vi.mock("../../package.json", () => ({ default: { version: "0.0.0" } }));

import {
  resolveTemplateVersions,
  formatTemplateNotice,
} from "../../src/lib/template-version-check.js";

let tmp: string;

const RANGE = "0.x";
const NOW = 1_000_000_000_000;

function release(version: string, opts?: { draft?: boolean; prerelease?: boolean }) {
  return {
    tag_name: `app-templates-v${version}`,
    draft: opts?.draft ?? false,
    prerelease: opts?.prerelease ?? false,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubFetch(response: Response) {
  const mock = vi.fn<typeof fetch>().mockResolvedValueOnce(response);
  vi.stubGlobal("fetch", mock);
  return mock;
}

function cachePath(): string {
  return join(tmp, "universe-cli", "templates", "template-version-check.json");
}

async function seedCache(
  latest: string,
  latestCompatible: string,
  lastCheck: number,
  cliVersion: string = "0.0.0",
): Promise<void> {
  const path = cachePath();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify({ latest, latestCompatible, lastCheck, cliVersion }), {
    mode: 0o644,
  });
}

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "universe-cli-tpl-"));
  vi.stubEnv("XDG_CACHE_HOME", tmp);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await rm(tmp, { recursive: true, force: true });
});

describe(resolveTemplateVersions, () => {
  it("returns both latest and latestCompatible", async () => {
    stubFetch(jsonResponse(200, [release("0.1.0"), release("0.3.0"), release("1.0.0")]));

    const result = await resolveTemplateVersions(RANGE, NOW);

    expect(result).toEqual({ latest: "1.0.0", latestCompatible: "0.3.0" });
  });

  it("returns equal latest and latestCompatible when all versions match range", async () => {
    stubFetch(jsonResponse(200, [release("0.1.0"), release("0.3.0")]));

    const result = await resolveTemplateVersions(RANGE, NOW);

    expect(result).toEqual({ latest: "0.3.0", latestCompatible: "0.3.0" });
  });

  it("throws on network error", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValueOnce(new Error("ECONNREFUSED")));

    await expect(resolveTemplateVersions(RANGE)).rejects.toThrow("Check network");
  });

  it("throws on non-2xx", async () => {
    stubFetch(jsonResponse(404, {}));

    await expect(resolveTemplateVersions(RANGE)).rejects.toThrow("HTTP 404");
  });

  it("throws when no valid releases exist", async () => {
    stubFetch(jsonResponse(200, []));

    await expect(resolveTemplateVersions(RANGE)).rejects.toThrow("No template releases found");
  });

  it("throws when no releases match range", async () => {
    stubFetch(jsonResponse(200, [release("1.0.0"), release("2.0.0")]));

    await expect(resolveTemplateVersions(RANGE)).rejects.toThrow("No template releases match");
  });

  it("excludes draft releases", async () => {
    stubFetch(jsonResponse(200, [release("0.2.0"), release("0.3.0", { draft: true })]));

    const result = await resolveTemplateVersions(RANGE);

    expect(result).toEqual({ latest: "0.2.0", latestCompatible: "0.2.0" });
  });

  it("excludes prerelease releases", async () => {
    stubFetch(jsonResponse(200, [release("0.2.0"), release("0.3.0", { prerelease: true })]));

    const result = await resolveTemplateVersions(RANGE);

    expect(result).toEqual({ latest: "0.2.0", latestCompatible: "0.2.0" });
  });

  it("ignores releases with wrong tag prefix", async () => {
    stubFetch(
      jsonResponse(200, [
        release("0.2.0"),
        { tag_name: "v0.5.0", draft: false, prerelease: false },
      ]),
    );

    const result = await resolveTemplateVersions(RANGE);

    expect(result).toEqual({ latest: "0.2.0", latestCompatible: "0.2.0" });
  });

  it("does not match a release whose tag lacks the expected prefix", async () => {
    // "wrong-templates" is 15 chars (same as "app-templates-v"),
    // so .slice(15) yields valid semver "0.9.0" — the prefix check
    // must reject this before slicing.
    stubFetch(
      jsonResponse(200, [{ tag_name: "wrong-templates0.9.0", draft: false, prerelease: false }]),
    );

    await expect(resolveTemplateVersions(RANGE)).rejects.toThrow("No template releases found");
  });

  it("writes cache after successful fetch", async () => {
    stubFetch(jsonResponse(200, [release("0.3.0"), release("1.0.0")]));

    await resolveTemplateVersions(RANGE, NOW);

    const raw = await readFile(cachePath(), "utf-8");
    expect(JSON.parse(raw)).toEqual({
      latest: "1.0.0",
      latestCompatible: "0.3.0",
      lastCheck: NOW,
      cliVersion: "0.0.0",
    });
  });

  it("does not write cache when fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValueOnce(new Error("network")));

    await expect(resolveTemplateVersions(RANGE)).rejects.toThrow();
    await expect(readFile(cachePath(), "utf-8")).rejects.toThrow();
  });

  it("serves from cache when fresh", async () => {
    await seedCache("1.0.0", "0.3.0", NOW - 60_000);
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveTemplateVersions(RANGE, NOW);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ latest: "1.0.0", latestCompatible: "0.3.0" });
  });

  it("re-fetches when cache is stale", async () => {
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    await seedCache("0.2.0", "0.2.0", NOW - ONE_DAY_MS - 1);
    stubFetch(jsonResponse(200, [release("0.2.0"), release("0.4.0"), release("1.0.0")]));

    const result = await resolveTemplateVersions(RANGE, NOW);

    expect(result).toEqual({ latest: "1.0.0", latestCompatible: "0.4.0" });
    const raw = await readFile(cachePath(), "utf-8");
    expect(JSON.parse(raw)).toEqual({
      latest: "1.0.0",
      latestCompatible: "0.4.0",
      lastCheck: NOW,
      cliVersion: "0.0.0",
    });
  });

  it("respects UNIVERSE_UPDATE_TTL_MS override", async () => {
    vi.stubEnv("UNIVERSE_UPDATE_TTL_MS", String(10 * 60 * 1000));
    await seedCache("1.0.0", "0.3.0", NOW - 5 * 60 * 1000);
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    await resolveTemplateVersions(RANGE, NOW);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends accept header for GitHub API", async () => {
    const fetchMock = stubFetch(jsonResponse(200, [release("0.3.0")]));

    await resolveTemplateVersions(RANGE);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["accept"]).toBe("application/vnd.github+json");
  });

  it("re-fetches when CLI version changes", async () => {
    await seedCache("1.0.0", "0.3.0", NOW - 60_000, "0.0.1"); // default cliVersion is 0.0.0
    const fetchMock = stubFetch(jsonResponse(200, [release("0.3.0"), release("1.0.0")]));

    await resolveTemplateVersions(RANGE, NOW);

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("treats cache without cliVersion as stale", async () => {
    const path = cachePath();
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(
      path,
      JSON.stringify({ latest: "1.0.0", latestCompatible: "0.3.0", lastCheck: NOW - 60_000 }),
      { mode: 0o644 },
    );
    const fetchMock = stubFetch(jsonResponse(200, [release("0.4.0"), release("1.1.0")]));

    const result = await resolveTemplateVersions(RANGE, NOW);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result).toEqual({ latest: "1.1.0", latestCompatible: "0.4.0" });
  });
});

describe(formatTemplateNotice, () => {
  it("renders clack-style frame with versions (plain)", () => {
    const output = formatTemplateNotice({ current: "0.3.0", latest: "1.0.0" }, false);

    expect(output).toBe(
      ["", "│", "▲  Newer templates available: 0.3.0 → 1.0.0", "└", ""].join("\n"),
    );
  });

  it("does not mention UNIVERSE_TEMPLATES_VERSION", () => {
    const output = formatTemplateNotice({ current: "0.3.0", latest: "1.0.0" }, false);

    expect(output).not.toContain("UNIVERSE_TEMPLATES_VERSION");
  });

  it("emits ANSI escape sequences when color enabled", () => {
    const out = formatTemplateNotice({ current: "0.3.0", latest: "1.0.0" }, true);

    expect(out).toContain("\x1b[");
    expect(out).toContain("0.3.0");
    expect(out).toContain("1.0.0");
  });
});
