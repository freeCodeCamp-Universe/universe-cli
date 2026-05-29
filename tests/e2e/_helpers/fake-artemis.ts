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

export interface RepoRow {
  id: string;
  name: string;
  owner: string;
  visibility: "public" | "private";
  description?: string;
  template?: string;
  status: "pending" | "approved" | "active" | "rejected" | "failed";
  url?: string;
  error?: string;
  requestedBy: string;
  approver?: string;
  rejectReason?: string;
  createdAt: string;
  updatedAt: string;
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
  /** PUT /api/deploy/.../upload?path=<key> returns 500 when key is in this set. */
  uploadFailPaths: Map<string, FailureInjection>;
  /** Next /finalize call returns this envelope (and clears the field). */
  finalizeFailure: FailureInjection | null;
  /** repo-request approval queue, keyed by request id. */
  repoRequests: Map<string, RepoRow>;
  /** templates returned by GET /api/repo/templates. */
  repoTemplates: string[];
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
    uploadFailPaths: new Map(),
    finalizeFailure: null,
    repoRequests: new Map(),
    repoTemplates: [],
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
    const uploadFail = state.uploadFailPaths.get(filePath);
    if (uploadFail) {
      logAndSend(
        callLog,
        method,
        path,
        authorization,
        body,
        res,
        uploadFail.status,
        { error: { code: uploadFail.code, message: uploadFail.message } },
      );
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
    if (state.finalizeFailure) {
      const f = state.finalizeFailure;
      state.finalizeFailure = null;
      logAndSend(callLog, method, path, authorization, body, res, f.status, {
        error: { code: f.code, message: f.message },
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

  const aliasMatch = /^\/api\/site\/([^/]+)\/alias\/([^/]+)$/.exec(path);
  if (method === "GET" && aliasMatch) {
    const site = decodeURIComponent(aliasMatch[1]!);
    const modeRaw = decodeURIComponent(aliasMatch[2]!);
    const token = parseBearer(authorization);
    const record = token ? state.tokens.get(token) : undefined;
    if (!record) {
      logAndSend(callLog, method, path, authorization, body, res, 401, {
        error: { code: "unauth", message: "bad token" },
      });
      return;
    }
    if (modeRaw !== "preview" && modeRaw !== "production") {
      logAndSend(callLog, method, path, authorization, body, res, 400, {
        error: {
          code: "bad_request",
          message: `mode must be 'preview' or 'production', got '${modeRaw}'`,
        },
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
    const mode = modeRaw as "preview" | "production";
    const aliasId = state.aliases[mode].get(site);
    if (!aliasId) {
      logAndSend(callLog, method, path, authorization, body, res, 404, {
        error: {
          code: "not_found",
          message: `no '${mode}' alias for site '${site}'`,
        },
      });
      return;
    }
    const subdomain = mode === "preview" ? `${site}.preview` : site;
    logAndSend(callLog, method, path, authorization, body, res, 200, {
      url: `https://${subdomain}.freecode.camp`,
      deployId: aliasId,
    });
    return;
  }

  const promoteMatch = /^\/api\/site\/([^/]+)\/promote$/.exec(path);
  if (method === "POST" && promoteMatch) {
    const site = decodeURIComponent(promoteMatch[1]!);
    const token = parseBearer(authorization);
    const record = token ? state.tokens.get(token) : undefined;
    if (!record) {
      logAndSend(callLog, method, path, authorization, body, res, 401, {
        error: { code: "unauth", message: "bad token" },
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
    // G3 body schema: {deployId?, expectedCurrent?}. Empty body = bare.
    let parsed: { deployId?: string; expectedCurrent?: string } = {};
    if (body.length > 0) {
      try {
        parsed = JSON.parse(body) as typeof parsed;
      } catch {
        logAndSend(callLog, method, path, authorization, body, res, 400, {
          error: { code: "bad_request", message: "invalid JSON body" },
        });
        return;
      }
    }
    const targetId =
      typeof parsed.deployId === "string" && parsed.deployId.length > 0
        ? parsed.deployId
        : state.aliases.preview.get(site);
    if (!targetId) {
      logAndSend(callLog, method, path, authorization, body, res, 404, {
        error: {
          code: "no_preview",
          message: `no preview deploy to promote for '${site}'`,
        },
      });
      return;
    }
    // CAS guard: expectedCurrent !== undefined means client opted in.
    if (parsed.expectedCurrent !== undefined) {
      const currentProd = state.aliases.production.get(site) ?? "";
      if (currentProd !== parsed.expectedCurrent) {
        logAndSend(callLog, method, path, authorization, body, res, 409, {
          error: {
            code: "alias_drift",
            message: `production alias is '${currentProd}', expected '${parsed.expectedCurrent}'`,
          },
          site,
          current: currentProd,
        });
        return;
      }
    }
    state.aliases.production.set(site, targetId);
    logAndSend(callLog, method, path, authorization, body, res, 200, {
      url: `https://${site}.freecode.camp`,
      deployId: targetId,
    });
    return;
  }

  const rollbackMatch = /^\/api\/site\/([^/]+)\/rollback$/.exec(path);
  if (method === "POST" && rollbackMatch) {
    const site = decodeURIComponent(rollbackMatch[1]!);
    const token = parseBearer(authorization);
    const record = token ? state.tokens.get(token) : undefined;
    if (!record) {
      logAndSend(callLog, method, path, authorization, body, res, 401, {
        error: { code: "unauth", message: "bad token" },
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
    let parsed: { to?: string; expectedCurrent?: string };
    try {
      parsed = JSON.parse(body) as typeof parsed;
    } catch {
      logAndSend(callLog, method, path, authorization, body, res, 400, {
        error: { code: "bad_request", message: "invalid JSON body" },
      });
      return;
    }
    const to = typeof parsed.to === "string" ? parsed.to : "";
    if (!to) {
      logAndSend(callLog, method, path, authorization, body, res, 400, {
        error: { code: "bad_request", message: "to is required" },
      });
      return;
    }
    // CAS guard (G3): if client supplied expectedCurrent, verify match.
    if (parsed.expectedCurrent !== undefined) {
      const currentProd = state.aliases.production.get(site) ?? "";
      if (currentProd !== parsed.expectedCurrent) {
        logAndSend(callLog, method, path, authorization, body, res, 409, {
          error: {
            code: "alias_drift",
            message: `production alias is '${currentProd}', expected '${parsed.expectedCurrent}'`,
          },
          site,
          current: currentProd,
        });
        return;
      }
    }
    const knownDeployIds = new Set<string>(
      (state.deploysBySite.get(site) ?? []).map((d) => d.deployId),
    );
    if (state.deploys.has(to)) knownDeployIds.add(to);
    if (!knownDeployIds.has(to)) {
      logAndSend(callLog, method, path, authorization, body, res, 404, {
        error: {
          code: "not_found",
          message: `deploy '${to}' not found for site '${site}'`,
        },
      });
      return;
    }
    state.aliases.production.set(site, to);
    logAndSend(callLog, method, path, authorization, body, res, 200, {
      url: `https://${site}.freecode.camp`,
      deployId: to,
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

  // --- repo-request feature (/api/repo*) ---
  const repoPath = path.split("?")[0] ?? path;
  const repoToken = parseBearer(authorization);
  const repoRecord = repoToken ? state.tokens.get(repoToken) : undefined;

  if (method === "POST" && repoPath === "/api/repo") {
    if (!repoRecord) {
      logAndSend(callLog, method, path, authorization, body, res, 401, {
        error: { code: "unauth", message: "bad token" },
      });
      return;
    }
    let parsed: {
      name?: string;
      visibility?: string;
      description?: string;
      template?: string;
    };
    try {
      parsed = JSON.parse(body) as typeof parsed;
    } catch {
      logAndSend(callLog, method, path, authorization, body, res, 400, {
        error: { code: "bad_request", message: "invalid JSON body" },
      });
      return;
    }
    const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
    if (name.length === 0) {
      logAndSend(callLog, method, path, authorization, body, res, 400, {
        error: { code: "invalid_name", message: "name is required" },
      });
      return;
    }
    // case-insensitive dedupe against non-terminal/active requests.
    for (const r of state.repoRequests.values()) {
      if (
        r.name.toLowerCase() === name.toLowerCase() &&
        r.status !== "rejected" &&
        r.status !== "failed"
      ) {
        logAndSend(callLog, method, path, authorization, body, res, 409, {
          error: {
            code: "already_exists",
            message: `a request for '${name}' is already pending or active`,
          },
        });
        return;
      }
    }
    const id = `req_${state.repoRequests.size + 1}`;
    const now = "2026-05-29T12:00:00Z";
    const row: RepoRow = {
      id,
      name,
      owner: "freeCodeCamp-Universe",
      visibility: parsed.visibility === "public" ? "public" : "private",
      ...(parsed.description ? { description: parsed.description } : {}),
      ...(parsed.template ? { template: parsed.template } : {}),
      status: "pending",
      requestedBy: repoRecord.login,
      createdAt: now,
      updatedAt: now,
    };
    state.repoRequests.set(id, row);
    logAndSend(callLog, method, path, authorization, body, res, 201, row);
    return;
  }

  if (method === "GET" && repoPath === "/api/repos") {
    if (!repoRecord) {
      logAndSend(callLog, method, path, authorization, body, res, 401, {
        error: { code: "unauth", message: "bad token" },
      });
      return;
    }
    const q = new URLSearchParams(path.split("?")[1] ?? "");
    const status = q.get("status") ?? "pending";
    const mine = q.get("mine") === "1" || q.get("mine") === "true";
    let rows = [...state.repoRequests.values()];
    if (status !== "all") rows = rows.filter((r) => r.status === status);
    if (mine) rows = rows.filter((r) => r.requestedBy === repoRecord.login);
    logAndSend(callLog, method, path, authorization, body, res, 200, rows);
    return;
  }

  if (method === "GET" && repoPath === "/api/repo/templates") {
    if (!repoRecord) {
      logAndSend(callLog, method, path, authorization, body, res, 401, {
        error: { code: "unauth", message: "bad token" },
      });
      return;
    }
    logAndSend(callLog, method, path, authorization, body, res, 200, {
      templates: state.repoTemplates,
    });
    return;
  }

  if (method === "GET" && repoPath.startsWith("/api/repo/")) {
    if (!repoRecord) {
      logAndSend(callLog, method, path, authorization, body, res, 401, {
        error: { code: "unauth", message: "bad token" },
      });
      return;
    }
    const id = repoPath.slice("/api/repo/".length);
    const row = state.repoRequests.get(id);
    if (!row) {
      logAndSend(callLog, method, path, authorization, body, res, 404, {
        error: { code: "not_found", message: "repo request not found" },
      });
      return;
    }
    logAndSend(callLog, method, path, authorization, body, res, 200, row);
    return;
  }

  if (
    method === "POST" &&
    repoPath.startsWith("/api/repo/") &&
    repoPath.endsWith("/approve")
  ) {
    if (!repoRecord) {
      logAndSend(callLog, method, path, authorization, body, res, 401, {
        error: { code: "unauth", message: "bad token" },
      });
      return;
    }
    const id = repoPath.slice("/api/repo/".length, -"/approve".length);
    const row = state.repoRequests.get(id);
    if (!row) {
      logAndSend(callLog, method, path, authorization, body, res, 404, {
        error: { code: "not_found", message: "repo request not found" },
      });
      return;
    }
    if (row.status !== "pending") {
      logAndSend(callLog, method, path, authorization, body, res, 409, {
        error: {
          code: "already_resolved",
          message: "request was already resolved by another admin",
        },
      });
      return;
    }
    const updated: RepoRow = {
      ...row,
      status: "active",
      url: `https://github.com/${row.owner}/${row.name}`,
      approver: repoRecord.login,
      updatedAt: "2026-05-29T12:05:00Z",
    };
    state.repoRequests.set(id, updated);
    logAndSend(callLog, method, path, authorization, body, res, 200, {
      outcome: "ok",
      request: updated,
    });
    return;
  }

  if (
    method === "POST" &&
    repoPath.startsWith("/api/repo/") &&
    repoPath.endsWith("/reject")
  ) {
    if (!repoRecord) {
      logAndSend(callLog, method, path, authorization, body, res, 401, {
        error: { code: "unauth", message: "bad token" },
      });
      return;
    }
    const id = repoPath.slice("/api/repo/".length, -"/reject".length);
    const row = state.repoRequests.get(id);
    if (!row) {
      logAndSend(callLog, method, path, authorization, body, res, 404, {
        error: { code: "not_found", message: "repo request not found" },
      });
      return;
    }
    if (row.status !== "pending") {
      logAndSend(callLog, method, path, authorization, body, res, 409, {
        error: {
          code: "already_resolved",
          message: "request was already resolved by another admin",
        },
      });
      return;
    }
    let reason = "";
    try {
      reason = (JSON.parse(body || "{}") as { reason?: string }).reason ?? "";
    } catch {
      reason = "";
    }
    const updated: RepoRow = {
      ...row,
      status: "rejected",
      rejectReason: reason,
      approver: repoRecord.login,
      updatedAt: "2026-05-29T12:05:00Z",
    };
    state.repoRequests.set(id, updated);
    logAndSend(callLog, method, path, authorization, body, res, 200, updated);
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
