import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { deploy } from "../../src/commands/deploy.js";
import { ls as staticLs } from "../../src/commands/ls.js";
import { whoami } from "../../src/commands/whoami.js";

/**
 * Real-artemis smoke matrix. Opt-in; never runs in normal `pnpm test`.
 *
 * Usage (operator side):
 *
 *   UNIVERSE_REAL_TOKEN=ghp_xxx \
 *   UNIVERSE_REAL_SITE=staff-smoke \
 *   pnpm test:smoke
 *
 * Required env:
 *   UNIVERSE_E2E_REAL   — set by the `test:smoke` script; gate flag.
 *   UNIVERSE_REAL_SITE  — pre-registered throwaway slug owned by the
 *                         operator (e.g. `test`, source repo
 *                         `freeCodeCamp-Universe/test-universe`). Must
 *                         already exist in the artemis registry; the
 *                         smoke does not register or delete sites.
 *
 * Optional env:
 *   UNIVERSE_REAL_TOKEN     — GitHub token authorized for the test site.
 *                             If unset, the identity chain falls through
 *                             to `gh auth token` (slot 2) — no env
 *                             extraction needed when `gh` is logged in.
 *   UNIVERSE_REAL_PROXY_URL — defaults to `https://uploads.freecode.camp`.
 *                             Set to a staging hostname to smoke-test a
 *                             non-prod artemis.
 *
 * What the smoke asserts:
 *   1. whoami       — token resolves; authorizedSites includes the test site.
 *   2. static ls    — deploys list returns as an array shape.
 *   3. deploy preview  — the new deployId lands on top of `ls`.
 *   4. deploy --promote — the new deployId lands on top of `ls` AND
 *                         the public URL serves a freshly-deployed
 *                         marker byte sequence (cache-busted fetch).
 *                         This is the closed-loop test for the
 *                         "sites not updating" complaint: if the
 *                         alias fails to flip on the artemis side, or
 *                         the CDN serves stale content past the deploy,
 *                         this test goes RED.
 *
 * The smoke leaves preview + production deploys behind in artemis. R2
 * bytes age out via the post-GA cleanup cron; deployId rows accumulate.
 * Recommend running against a dedicated throwaway site to avoid
 * polluting a production-traffic site's history.
 */

const REAL_E2E = process.env["UNIVERSE_E2E_REAL"] === "1";
const REAL_TOKEN = process.env["UNIVERSE_REAL_TOKEN"];
const REAL_SITE = process.env["UNIVERSE_REAL_SITE"];
const REAL_PROXY_URL =
  process.env["UNIVERSE_REAL_PROXY_URL"] ?? "https://uploads.freecode.camp";

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

interface RunResult {
  captured: CapturedExit;
  envelope: Record<string, unknown> | undefined;
}

async function captureJsonRun(fn: () => Promise<void>): Promise<RunResult> {
  const chunks: string[] = [];
  const spy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: unknown) => {
      chunks.push(String(chunk));
      return true;
    });
  const captured: CapturedExit = {};
  try {
    await fn();
  } catch (err) {
    if (!(err instanceof Error) || !("__exit__" in err)) throw err;
  }
  spy.mockRestore();
  const raw = chunks.join("").trim();
  const envelope =
    raw.length > 0 ? (JSON.parse(raw) as Record<string, unknown>) : undefined;
  return { captured, envelope };
}

function makeEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    UNIVERSE_PROXY_URL: REAL_PROXY_URL,
    NO_COLOR: "1",
    PATH: process.env["PATH"] ?? "",
  };
  if (REAL_TOKEN) env["GITHUB_TOKEN"] = REAL_TOKEN;
  return env;
}

describe.skipIf(!REAL_E2E)("real-artemis smoke (opt-in)", () => {
  let projectDir: string | undefined;
  const marker = `smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  beforeAll(() => {
    if (!REAL_SITE) {
      throw new Error(
        "real-artemis smoke requires UNIVERSE_REAL_SITE env var (UNIVERSE_REAL_TOKEN optional if `gh auth status` is logged in)",
      );
    }
  });

  afterAll(async () => {
    if (projectDir) {
      await rm(projectDir, { recursive: true, force: true });
    }
  });

  it("whoami resolves token and includes the test site in authorizedSites", async () => {
    const env = makeEnv();
    const r = await captureJsonRun(() =>
      whoami(
        { json: true },
        {
          env,
          exit: makeExit({}),
          logSuccess: vi.fn(),
          logError: vi.fn(),
        },
      ),
    );
    expect(r.captured.code).toBeUndefined();
    expect(r.envelope!["success"]).toBe(true);
    expect(r.envelope!["login"]).toBeDefined();
    expect(r.envelope!["authorizedSitesCount"]).toBeGreaterThan(0);
  }, 30_000);

  it("static ls returns an array shape for the test site", async () => {
    const env = makeEnv();
    const r = await captureJsonRun(() =>
      staticLs(
        { json: true, site: REAL_SITE! },
        {
          env,
          exit: makeExit({}),
          logSuccess: vi.fn(),
          logInfo: vi.fn(),
          logError: vi.fn(),
        },
      ),
    );
    expect(r.captured.code).toBeUndefined();
    expect(r.envelope!["success"]).toBe(true);
    expect(Array.isArray(r.envelope!["deploys"])).toBe(true);
  }, 30_000);

  it("deploy (preview) — new deployId lands on top of `ls`", async () => {
    projectDir = await mkdtemp(join(tmpdir(), "universe-cli-smoke-prev-"));
    const distDir = join(projectDir, "dist");
    await mkdir(distDir, { recursive: true });
    await writeFile(
      join(projectDir, "platform.yaml"),
      `site: ${REAL_SITE}\n`,
      "utf-8",
    );
    await writeFile(
      join(distDir, "index.html"),
      `<!-- preview marker: ${marker} -->\n<html><body>preview ${marker}</body></html>\n`,
      "utf-8",
    );

    const env = makeEnv();
    const r = await captureJsonRun(() =>
      deploy(
        { json: true, promote: false },
        {
          cwd: projectDir!,
          env,
          exit: makeExit({}),
          logSuccess: vi.fn(),
          logInfo: vi.fn(),
          logWarn: vi.fn(),
          logError: vi.fn(),
        },
      ),
    );
    expect(r.captured.code).toBeUndefined();
    expect(r.envelope!["mode"]).toBe("preview");
    const newDeployId = r.envelope!["deployId"] as string;
    expect(newDeployId).toMatch(/^\d{8}-\d{6}-\S+$/);

    const lsResult = await captureJsonRun(() =>
      staticLs(
        { json: true, site: REAL_SITE! },
        {
          env,
          exit: makeExit({}),
          logSuccess: vi.fn(),
          logInfo: vi.fn(),
          logError: vi.fn(),
        },
      ),
    );
    const deploys = lsResult.envelope!["deploys"] as Array<{
      deployId: string;
    }>;
    expect(deploys[0]?.deployId).toBe(newDeployId);
  }, 120_000);

  it("deploy --promote — production alias serves the new marker (alpha)", async () => {
    projectDir = await mkdtemp(join(tmpdir(), "universe-cli-smoke-prod-"));
    const distDir = join(projectDir, "dist");
    await mkdir(distDir, { recursive: true });
    await writeFile(
      join(projectDir, "platform.yaml"),
      `site: ${REAL_SITE}\n`,
      "utf-8",
    );
    const prodMarker = `prod-${marker}`;
    await writeFile(
      join(distDir, "index.html"),
      `<!-- production marker: ${prodMarker} -->\n<html><body>${prodMarker}</body></html>\n`,
      "utf-8",
    );

    const env = makeEnv();
    const r = await captureJsonRun(() =>
      deploy(
        { json: true, promote: true },
        {
          cwd: projectDir!,
          env,
          exit: makeExit({}),
          logSuccess: vi.fn(),
          logInfo: vi.fn(),
          logWarn: vi.fn(),
          logError: vi.fn(),
        },
      ),
    );
    expect(r.captured.code).toBeUndefined();
    expect(r.envelope!["mode"]).toBe("production");
    const newDeployId = r.envelope!["deployId"] as string;
    const publicUrl = r.envelope!["url"] as string;
    expect(newDeployId).toMatch(/^\d{8}-\d{6}-\S+$/);
    expect(publicUrl).toMatch(/^https:\/\//);

    const lsResult = await captureJsonRun(() =>
      staticLs(
        { json: true, site: REAL_SITE! },
        {
          env,
          exit: makeExit({}),
          logSuccess: vi.fn(),
          logInfo: vi.fn(),
          logError: vi.fn(),
        },
      ),
    );
    const deploys = lsResult.envelope!["deploys"] as Array<{
      deployId: string;
    }>;
    expect(deploys[0]?.deployId).toBe(newDeployId);

    const fetched = await fetchWithRetry(
      `${publicUrl}/?_=${prodMarker}`,
      prodMarker,
    );
    expect(fetched.bodyContainsMarker).toBe(true);
    if (!fetched.bodyContainsMarker) {
      throw new Error(
        `production alias did not serve new marker. Last body (first 500 chars): ${fetched.body.slice(0, 500)}`,
      );
    }
  }, 300_000);
});

interface FetchResult {
  body: string;
  bodyContainsMarker: boolean;
  attempts: number;
}

async function fetchWithRetry(
  url: string,
  marker: string,
): Promise<FetchResult> {
  const maxAttempts = 20;
  const delayMs = 3_000;
  let body = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const resp = await fetch(url, {
        cache: "no-store",
        headers: { "cache-control": "no-cache, no-store" },
      });
      body = await resp.text();
      if (body.includes(marker)) {
        return { body, bodyContainsMarker: true, attempts: attempt };
      }
    } catch {
      // network error — retry
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return { body, bodyContainsMarker: false, attempts: maxAttempts };
}
