import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Local stand-in for the artemis deploy proxy used by the E2E suite.
 *
 * Routes are added per task as the suite grows. Today: GET /api/whoami.
 * Each successive task ends adds the routes it exercises (see PLAN P0+).
 *
 * The fixture's behavior is what artemis SHOULD do per ADR-016. CI green
 * + prod broken pinpoints the server, not the CLI — that's the whole
 * point of having an in-house contract surface to assert against.
 */

export interface TokenRecord {
  login: string;
  authorizedSites: string[];
}

/** Mirrors `SiteRow` in `src/lib/proxy-client.ts` (artemis registry shape). */
export interface SiteRow {
  slug: string;
  teams: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

/** Mirrors `DeploySummary` in `src/lib/proxy-client.ts`. */
export interface DeploySummary {
  deployId: string;
}

/**
 * One in-flight or completed deploy session.
 *
 * `expectedFiles` is the manifest declared at /init. `uploadedFiles`
 * is what actually arrived via PUT /upload — a finalize-time mismatch
 * lets the fixture model `verify_failed` (422) without ad-hoc state.
 */
export interface DeployRecord {
  deployId: string;
  site: string;
  sha: string;
  expectedFiles: string[];
  uploadedFiles: Map<string, string>;
  finalized: boolean;
  mode?: "preview" | "production";
}

export interface DeployJwtRecord {
  deployId: string;
  site: string;
  login: string;
}

/**
 * Per-route forced error. Key shape is `"<METHOD> <path>"`,
 * e.g. `"GET /api/whoami"`. When present, the route returns the
 * error envelope verbatim instead of running normal handler logic.
 * Mirrors the artemis error envelope (`{error: {code, message}}`).
 */
export interface FailureInjection {
  status: number;
  code: string;
  message: string;
}

export interface FakeArtemisState {
  tokens: Map<string, TokenRecord>;
  failures: Map<string, FailureInjection>;
  registry: Map<string, SiteRow>;
  deploysBySite: Map<string, DeploySummary[]>;
  deploys: Map<string, DeployRecord>;
  deployJwts: Map<string, DeployJwtRecord>;
  aliases: {
    preview: Map<string, string>;
    production: Map<string, string>;
  };
}

export interface CallLogEntry {
  method: string;
  path: string;
  authorization?: string;
  status: number;
  /** Raw request body decoded as utf-8. Empty string for GET / DELETE. */
  body: string;
}

export interface FakeArtemis {
  url: string;
  state: FakeArtemisState;
  callLog: CallLogEntry[];
  close: () => Promise<void>;
}

export async function startFakeArtemis(): Promise<FakeArtemis> {
  const state: FakeArtemisState = {
    tokens: new Map(),
    failures: new Map(),
    registry: new Map(),
    deploysBySite: new Map(),
    deploys: new Map(),
    deployJwts: new Map(),
    aliases: { preview: new Map(), production: new Map() },
  };
  const callLog: CallLogEntry[] = [];

  const server: Server = createServer((req, res) => {
    void handle(req, res, state, callLog);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  const addr = server.address() as AddressInfo;
  let closed = false;

  return {
    url: `http://127.0.0.1:${addr.port}`,
    state,
    callLog,
    close: () => {
      if (closed) return Promise.resolve();
      closed = true;
      return new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  state: FakeArtemisState,
  callLog: CallLogEntry[],
): Promise<void> {
  const method = req.method ?? "GET";
  const path = req.url ?? "";
  const authorization =
    typeof req.headers["authorization"] === "string"
      ? req.headers["authorization"]
      : undefined;
  const body = await readBody(req);

  const forced = state.failures.get(`${method} ${path}`);
  if (forced) {
    logAndSend(callLog, method, path, authorization, body, res, forced.status, {
      error: { code: forced.code, message: forced.message },
    });
    return;
  }

  if (method === "GET" && path === "/api/whoami") {
    const token = parseBearer(authorization);
    const record = token ? state.tokens.get(token) : undefined;
    if (!record) {
      logAndSend(callLog, method, path, authorization, body, res, 401, {
        error: { code: "unauth", message: "bad token" },
      });
      return;
    }
    logAndSend(callLog, method, path, authorization, body, res, 200, {
      login: record.login,
      authorizedSites: record.authorizedSites,
    });
    return;
  }

  if (method === "GET" && path === "/api/sites") {
    const token = parseBearer(authorization);
    const record = token ? state.tokens.get(token) : undefined;
    if (!record) {
      logAndSend(callLog, method, path, authorization, body, res, 401, {
        error: { code: "unauth", message: "bad token" },
      });
      return;
    }
    const rows = Array.from(state.registry.values());
    logAndSend(callLog, method, path, authorization, body, res, 200, rows);
    return;
  }

  const deploysMatch = /^\/api\/site\/([^/]+)\/deploys$/.exec(path);
  if (method === "GET" && deploysMatch) {
    const site = decodeURIComponent(deploysMatch[1]!);
    const token = parseBearer(authorization);
    const record = token ? state.tokens.get(token) : undefined;
    if (!record) {
      logAndSend(callLog, method, path, authorization, body, res, 401, {
        error: { code: "unauth", message: "bad token" },
      });
      return;
    }
    if (!state.registry.has(site)) {
      logAndSend(callLog, method, path, authorization, body, res, 404, {
        error: {
          code: "not_found",
          message: `site '${site}' is not registered`,
        },
      });
      return;
    }
    if (!record.authorizedSites.includes(site)) {
      logAndSend(callLog, method, path, authorization, body, res, 403, {
        error: {
          code: "site_unauthorized",
          message: `not authorized for site '${site}'`,
        },
      });
      return;
    }
    const list = state.deploysBySite.get(site) ?? [];
    logAndSend(callLog, method, path, authorization, body, res, 200, list);
    return;
  }

  if (method === "POST" && path === "/api/site/register") {
    const token = parseBearer(authorization);
    const record = token ? state.tokens.get(token) : undefined;
    if (!record) {
      logAndSend(callLog, method, path, authorization, body, res, 401, {
        error: { code: "unauth", message: "bad token" },
      });
      return;
    }
    let parsed: { slug?: string; teams?: string[] };
    try {
      parsed = JSON.parse(body) as typeof parsed;
    } catch {
      logAndSend(callLog, method, path, authorization, body, res, 400, {
        error: { code: "bad_request", message: "invalid JSON body" },
      });
      return;
    }
    const slug = typeof parsed.slug === "string" ? parsed.slug.trim() : "";
    if (slug.length === 0) {
      logAndSend(callLog, method, path, authorization, body, res, 400, {
        error: { code: "bad_request", message: "slug is required" },
      });
      return;
    }
    if (state.registry.has(slug)) {
      logAndSend(callLog, method, path, authorization, body, res, 409, {
        error: {
          code: "already_exists",
          message: `site '${slug}' is already registered`,
        },
      });
      return;
    }
    const teams =
      Array.isArray(parsed.teams) && parsed.teams.length > 0
        ? parsed.teams
        : ["staff"];
    const now = "2026-05-12T00:00:00Z";
    const row: SiteRow = {
      slug,
      teams,
      createdAt: now,
      updatedAt: now,
      createdBy: record.login,
    };
    state.registry.set(slug, row);
    logAndSend(callLog, method, path, authorization, body, res, 201, row);
    return;
  }

  if (method === "POST" && path === "/api/deploy/init") {
    const token = parseBearer(authorization);
    const record = token ? state.tokens.get(token) : undefined;
    if (!record) {
      logAndSend(callLog, method, path, authorization, body, res, 401, {
        error: { code: "unauth", message: "bad token" },
      });
      return;
    }
    let parsed: { site?: string; sha?: string; files?: string[] };
    try {
      parsed = JSON.parse(body) as typeof parsed;
    } catch {
      logAndSend(callLog, method, path, authorization, body, res, 400, {
        error: { code: "bad_request", message: "invalid JSON body" },
      });
      return;
    }
    const site = typeof parsed.site === "string" ? parsed.site : "";
    const sha = typeof parsed.sha === "string" ? parsed.sha : "";
    if (!site || !sha) {
      logAndSend(callLog, method, path, authorization, body, res, 400, {
        error: { code: "bad_request", message: "site and sha are required" },
      });
      return;
    }
    if (!record.authorizedSites.includes(site)) {
      logAndSend(callLog, method, path, authorization, body, res, 403, {
        error: {
          code: "site_unauthorized",
          message: `not authorized for site '${site}'`,
        },
      });
      return;
    }
    const stamp = "20260512-120000";
    const shortSha = sha.slice(0, 7);
    const deployId = `${stamp}-${shortSha}`;
    const jwt = `eyJ.fake.${deployId}`;
    const expectedFiles = Array.isArray(parsed.files) ? parsed.files : [];
    state.deploys.set(deployId, {
      deployId,
      site,
      sha,
      expectedFiles,
      uploadedFiles: new Map(),
      finalized: false,
    });
    state.deployJwts.set(jwt, { deployId, site, login: record.login });
    logAndSend(callLog, method, path, authorization, body, res, 200, {
      deployId,
      jwt,
      expiresAt: "2026-05-12T13:00:00Z",
    });
    return;
  }

  const uploadMatch = /^\/api\/deploy\/([^/]+)\/upload\?path=(.+)$/.exec(path);
  if (method === "PUT" && uploadMatch) {
    const deployId = decodeURIComponent(uploadMatch[1]!);
    const filePath = decodeURIComponent(uploadMatch[2]!);
    const jwt = parseBearer(authorization);
    const jwtRecord = jwt ? state.deployJwts.get(jwt) : undefined;
    if (!jwtRecord || jwtRecord.deployId !== deployId) {
      logAndSend(callLog, method, path, authorization, body, res, 401, {
        error: { code: "unauth", message: "deploy jwt invalid for this id" },
      });
      return;
    }
    const deploy = state.deploys.get(deployId);
    if (!deploy) {
      logAndSend(callLog, method, path, authorization, body, res, 404, {
        error: { code: "not_found", message: `deploy '${deployId}' not found` },
      });
      return;
    }
    deploy.uploadedFiles.set(filePath, body);
    logAndSend(callLog, method, path, authorization, body, res, 200, {
      received: filePath,
      key: `site/${deploy.site}/deploys/${deployId}/${filePath}`,
    });
    return;
  }

  const finalizeMatch = /^\/api\/deploy\/([^/]+)\/finalize$/.exec(path);
  if (method === "POST" && finalizeMatch) {
    const deployId = decodeURIComponent(finalizeMatch[1]!);
    const jwt = parseBearer(authorization);
    const jwtRecord = jwt ? state.deployJwts.get(jwt) : undefined;
    if (!jwtRecord || jwtRecord.deployId !== deployId) {
      logAndSend(callLog, method, path, authorization, body, res, 401, {
        error: { code: "unauth", message: "deploy jwt invalid for this id" },
      });
      return;
    }
    const deploy = state.deploys.get(deployId);
    if (!deploy) {
      logAndSend(callLog, method, path, authorization, body, res, 404, {
        error: { code: "not_found", message: `deploy '${deployId}' not found` },
      });
      return;
    }
    let parsed: { mode?: string; files?: string[] };
    try {
      parsed = JSON.parse(body) as typeof parsed;
    } catch {
      logAndSend(callLog, method, path, authorization, body, res, 400, {
        error: { code: "bad_request", message: "invalid JSON body" },
      });
      return;
    }
    const mode = parsed.mode === "production" ? "production" : "preview";
    const files = Array.isArray(parsed.files) ? parsed.files : [];
    const missing = files.filter((f) => !deploy.uploadedFiles.has(f));
    if (missing.length > 0) {
      logAndSend(callLog, method, path, authorization, body, res, 422, {
        error: {
          code: "verify_failed",
          message: `deploy is missing expected files: ${missing.join(", ")}`,
        },
      });
      return;
    }
    deploy.finalized = true;
    deploy.mode = mode;
    state.aliases[mode].set(deploy.site, deployId);
    const list = state.deploysBySite.get(deploy.site) ?? [];
    list.unshift({ deployId });
    state.deploysBySite.set(deploy.site, list);
    const subdomain =
      mode === "preview" ? `${deploy.site}.preview` : deploy.site;
    logAndSend(callLog, method, path, authorization, body, res, 200, {
      url: `https://${subdomain}.freecode.camp`,
      deployId,
      mode,
    });
    return;
  }

  const slugRouteMatch = /^\/api\/site\/([^/]+)$/.exec(path);
  if (slugRouteMatch && (method === "PATCH" || method === "DELETE")) {
    const slug = decodeURIComponent(slugRouteMatch[1]!);
    const token = parseBearer(authorization);
    const record = token ? state.tokens.get(token) : undefined;
    if (!record) {
      logAndSend(callLog, method, path, authorization, body, res, 401, {
        error: { code: "unauth", message: "bad token" },
      });
      return;
    }
    const existing = state.registry.get(slug);
    if (!existing) {
      logAndSend(callLog, method, path, authorization, body, res, 404, {
        error: {
          code: "not_found",
          message: `site '${slug}' is not registered`,
        },
      });
      return;
    }
    if (method === "PATCH") {
      let parsed: { teams?: unknown };
      try {
        parsed = JSON.parse(body) as typeof parsed;
      } catch {
        logAndSend(callLog, method, path, authorization, body, res, 400, {
          error: { code: "bad_request", message: "invalid JSON body" },
        });
        return;
      }
      if (!Array.isArray(parsed.teams) || parsed.teams.length === 0) {
        logAndSend(callLog, method, path, authorization, body, res, 400, {
          error: {
            code: "bad_request",
            message: "teams must be a non-empty array",
          },
        });
        return;
      }
      const updated: SiteRow = {
        ...existing,
        teams: parsed.teams as string[],
        updatedAt: "2026-05-12T12:00:00Z",
      };
      state.registry.set(slug, updated);
      logAndSend(callLog, method, path, authorization, body, res, 200, updated);
      return;
    }
    state.registry.delete(slug);
    res.statusCode = 204;
    res.end();
    callLog.push({ method, path, authorization, status: 204, body });
    return;
  }

  logAndSend(callLog, method, path, authorization, body, res, 404, {
    error: { code: "not_found", message: `no route: ${method} ${path}` },
  });
}

function parseBearer(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const parts = header.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return undefined;
  return parts[1];
}

function logAndSend(
  callLog: CallLogEntry[],
  method: string,
  path: string,
  authorization: string | undefined,
  requestBody: string,
  res: ServerResponse,
  status: number,
  responseBody: unknown,
): void {
  callLog.push({ method, path, authorization, status, body: requestBody });
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(responseBody));
}
