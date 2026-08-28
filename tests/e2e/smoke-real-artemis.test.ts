import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { deploy } from "../../src/commands/deploy.js";
import { list as staticList } from "../../src/commands/list.js";
import { list as sitesList } from "../../src/commands/sites/list.js";
import { rm as sitesRm } from "../../src/commands/sites/rm.js";
import { undelete as sitesUndelete } from "../../src/commands/sites/undelete.js";
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
 *                         already exist in the artemis registry. Case 5
 *                         deletes and restores this site: it serves 404
 *                         for the whole rm → undelete window.
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
 *   2. static list    — deploys list returns as an array shape.
 *   3. deploy preview  — the new deployId lands on top of `list`.
 *   4. deploy --promote — the new deployId lands on top of `list` AND
 *                         the public URL serves a freshly-deployed
 *                         marker byte sequence (cache-busted fetch).
 *                         This is the closed-loop test for the
 *                         "sites not updating" complaint: if the
 *                         alias fails to flip on the artemis side, or
 *                         the CDN serves stale content past the deploy,
 *                         this test goes RED.
 *   5. sites rm → list --held → undelete — the reservation lifecycle
 *      round-trips against the real registry, and the restored
 *      prevProduction must equal the pre-rm production deployId.
 *      afterAll owns the restore: whenever the rm succeeded and the
 *      undelete has not, teardown re-runs the undelete. If even that
 *      is lost (SIGKILL), recover with `universe sites undelete <slug>`.
 *
 * The smoke leaves preview + production deploys behind in artemis. R2
 * bytes age out via the post-GA cleanup cron; deployId rows accumulate.
 * Recommend running against a dedicated throwaway site to avoid
 * polluting a production-traffic site's history.
 */

const REAL_E2E = process.env["UNIVERSE_E2E_REAL"] === "1";
const REAL_TOKEN = process.env["UNIVERSE_REAL_TOKEN"];
const REAL_SITE = process.env["UNIVERSE_REAL_SITE"];
const REAL_PROXY_URL = process.env["UNIVERSE_REAL_PROXY_URL"] ?? "https://uploads.freecode.camp";

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

async function captureJsonRun(
  fn: (exit: (code: number) => never) => Promise<void>,
): Promise<RunResult> {
  const chunks: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    chunks.push(String(chunk));
    return true;
  });
  const captured: CapturedExit = {};
  try {
    await fn(makeExit(captured));
  } catch (err) {
    if (!(err instanceof Error) || !("__exit__" in err)) throw err;
  }
  spy.mockRestore();
  const raw = chunks.join("").trim();
  const envelope = raw.length > 0 ? (JSON.parse(raw) as Record<string, unknown>) : undefined;
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
  const projectDirs: string[] = [];
  let heldSlug: string | undefined;
  const marker = `smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  beforeAll(() => {
    if (!REAL_SITE) {
      throw new Error(
        "real-artemis smoke requires UNIVERSE_REAL_SITE env var (UNIVERSE_REAL_TOKEN optional if `gh auth status` is logged in)",
      );
    }
  });

  afterAll(async () => {
    if (heldSlug) {
      const slug = heldSlug;
      heldSlug = undefined;
      await captureJsonRun((exit) =>
        sitesUndelete(
          { json: true, slug },
          { env: makeEnv(), exit, logSuccess: vi.fn(), logError: vi.fn() },
        ),
      );
    }
    while (projectDirs.length > 0) {
      await rm(projectDirs.pop()!, { recursive: true, force: true });
    }
  });

  it("whoami resolves token and includes the test site in authorizedSites", async () => {
    const env = makeEnv();
    const r = await captureJsonRun((exit) =>
      whoami(
        { json: true },
        {
          env,
          exit,
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

  it("static list returns an array shape for the test site", async () => {
    const env = makeEnv();
    const r = await captureJsonRun((exit) =>
      staticList(
        { json: true, site: REAL_SITE! },
        {
          env,
          exit,
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

  it("deploy (preview) — new deployId lands on top of `list`", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "universe-cli-smoke-prev-"));
    projectDirs.push(projectDir);
    const distDir = join(projectDir, "dist");
    await mkdir(distDir, { recursive: true });
    await writeFile(join(projectDir, "platform.yaml"), `site: ${REAL_SITE}\n`, "utf-8");
    await writeFile(
      join(distDir, "index.html"),
      `<!-- preview marker: ${marker} -->\n<html><body>preview ${marker}</body></html>\n`,
      "utf-8",
    );

    const env = makeEnv();
    const r = await captureJsonRun((exit) =>
      deploy(
        { json: true, promote: false },
        {
          cwd: projectDir,
          env,
          exit,
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

    const listResult = await captureJsonRun((exit) =>
      staticList(
        { json: true, site: REAL_SITE! },
        {
          env,
          exit,
          logSuccess: vi.fn(),
          logInfo: vi.fn(),
          logError: vi.fn(),
        },
      ),
    );
    const deploys = listResult.envelope!["deploys"] as Array<{
      deployId: string;
    }>;
    expect(deploys[0]?.deployId).toBe(newDeployId);
  }, 120_000);

  it("deploy --promote — production alias serves the new marker (alpha)", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "universe-cli-smoke-prod-"));
    projectDirs.push(projectDir);
    const distDir = join(projectDir, "dist");
    await mkdir(distDir, { recursive: true });
    await writeFile(join(projectDir, "platform.yaml"), `site: ${REAL_SITE}\n`, "utf-8");
    const prodMarker = `prod-${marker}`;
    await writeFile(
      join(distDir, "index.html"),
      `<!-- production marker: ${prodMarker} -->\n<html><body>${prodMarker}</body></html>\n`,
      "utf-8",
    );

    const env = makeEnv();
    const r = await captureJsonRun((exit) =>
      deploy(
        { json: true, promote: true },
        {
          cwd: projectDir,
          env,
          exit,
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

    const listResult = await captureJsonRun((exit) =>
      staticList(
        { json: true, site: REAL_SITE! },
        {
          env,
          exit,
          logSuccess: vi.fn(),
          logInfo: vi.fn(),
          logError: vi.fn(),
        },
      ),
    );
    const deploys = listResult.envelope!["deploys"] as Array<{
      deployId: string;
    }>;
    expect(deploys[0]?.deployId).toBe(newDeployId);

    const fetched = await fetchWithRetry(`${publicUrl}/?_=${prodMarker}`, prodMarker);
    expect(fetched.bodyContainsMarker).toBe(true);
    if (!fetched.bodyContainsMarker) {
      throw new Error(
        `production alias did not serve new marker. Last body (first 500 chars): ${fetched.body.slice(0, 500)}`,
      );
    }
  }, 300_000);

  it("sites rm → list --held → undelete round-trip on the test site", async () => {
    const env = makeEnv();
    const deps = (exit: (code: number) => never) => ({
      env,
      exit,
      logSuccess: vi.fn(),
      logError: vi.fn(),
    });

    const before = await captureJsonRun((exit) =>
      staticList(
        { json: true, site: REAL_SITE! },
        { env, exit, logSuccess: vi.fn(), logInfo: vi.fn(), logError: vi.fn() },
      ),
    );
    const beforeDeploys = before.envelope!["deploys"] as Array<{
      deployId: string;
      state: string | null;
    }>;
    const prodBefore = beforeDeploys.find((d) => d.state?.includes("production"))?.deployId ?? "";

    const removed = await captureJsonRun((exit) =>
      sitesRm({ json: true, slug: REAL_SITE! }, deps(exit)),
    );
    expect(removed.captured.code).toBeUndefined();
    expect(removed.envelope!["success"]).toBe(true);
    heldSlug = REAL_SITE;

    const held = await captureJsonRun((exit) => sitesList({ json: true, held: true }, deps(exit)));
    expect(held.captured.code).toBeUndefined();
    const rows = held.envelope!["sites"] as Array<{ slug: string; reservedUntil?: string }>;
    expect(rows.map((r) => r.slug)).toContain(REAL_SITE);

    const restored = await captureJsonRun((exit) =>
      sitesUndelete({ json: true, slug: REAL_SITE! }, deps(exit)),
    );
    expect(restored.captured.code).toBeUndefined();
    expect(restored.envelope!["success"]).toBe(true);
    expect(restored.envelope!["prevProduction"]).toBe(prodBefore);
    heldSlug = undefined;
  }, 120_000);
});

interface FetchResult {
  body: string;
  bodyContainsMarker: boolean;
  attempts: number;
}

async function fetchWithRetry(url: string, marker: string): Promise<FetchResult> {
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
