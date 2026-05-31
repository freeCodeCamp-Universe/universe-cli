import { CliError } from "../errors.js";
import {
  EXIT_CREDENTIALS,
  EXIT_STORAGE,
  EXIT_USAGE,
} from "../output/exit-codes.js";
import {
  repoApproveResultSchema,
  repoRowArraySchema,
  repoRowSchema,
  repoTemplatesResponseSchema,
} from "../commands/repo/schema.js";

/**
 * Typed fetch wrapper for the artemis deploy proxy.
 *
 * Mirrors the routes defined in
 * `~/DEV/fCC/artemis/internal/server/server.go` and the request /
 * response shapes from `internal/handler/{deploy,site,site_register,whoami}.go`.
 *
 *   GET    /api/whoami                                — GitHub bearer
 *   POST   /api/deploy/init                           — GitHub bearer
 *   PUT    /api/deploy/{deployId}/upload?path=<rel>   — Deploy-session JWT
 *   POST   /api/deploy/{deployId}/finalize            — Deploy-session JWT
 *   GET    /api/site/{site}/deploys                   — GitHub bearer
 *   POST   /api/site/{site}/promote                   — GitHub bearer
 *   POST   /api/site/{site}/rollback                  — GitHub bearer
 *   POST   /api/site/register                         — staff (RegistryAuthzTeam)
 *   GET    /api/sites                                 — GitHub bearer
 *   PATCH  /api/site/{slug}                           — staff (RegistryAuthzTeam)
 *   DELETE /api/site/{slug}                           — staff (RegistryAuthzTeam)
 *
 * The user-bearer paths read their token via the supplied `getAuthToken`
 * resolver (priority chain lives in `lib/identity.ts`). The deploy-JWT
 * paths take the JWT explicitly because the JWT was minted by
 * `/api/deploy/init` and is bound to a single (login, site, deployId)
 * triple — passing it through the same auth resolver would be a
 * footgun.
 */

export interface ProxyClientConfig {
  baseUrl: string;
  getAuthToken: () => Promise<string> | string;
  fetch?: typeof globalThis.fetch;
  /**
   * Per-request fetch timeout in milliseconds. Defaults to 30000.
   * Pass 0 to disable (uploads with their own caller-supplied
   * AbortSignal are unaffected — signals are merged via
   * AbortSignal.any when both are present).
   */
  timeoutMs?: number;
  debug?: boolean;
}

/**
 * DEFAULT_FETCH_TIMEOUT_MS is the budget for a single fetch
 * round-trip. Picked to accommodate a slow R2 round-trip during
 * deploy finalize without leaving an operator staring at a CLI
 * that will never return; `parseFetchTimeoutMs` reads the env
 * override.
 */
export const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

/**
 * parseFetchTimeoutMs reads `UNIVERSE_FETCH_TIMEOUT_MS` from the
 * supplied environment, returning a positive integer or undefined
 * (which leaves `createProxyClient` on its default). Designed for
 * setupClient/whoami wiring; surfaces in the public API so command
 * teardown can share the parse contract.
 */
export function parseFetchTimeoutMs(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): number | undefined {
  const raw = env["UNIVERSE_FETCH_TIMEOUT_MS"];
  if (raw === undefined || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.floor(n);
}

export type DeployMode = "preview" | "production";

export interface WhoAmIResponse {
  login: string;
  authorizedSites: string[];
}

export interface DeployInitRequest {
  site: string;
  sha: string;
  files?: string[];
}

export interface DeployInitResponse {
  deployId: string;
  jwt: string;
  expiresAt: string;
}

export interface DeployUploadRequest {
  deployId: string;
  jwt: string;
  path: string;
  body: BodyInit;
  contentType?: string;
}

export interface DeployUploadResponse {
  received: string;
  key: string;
}

export interface DeployFinalizeRequest {
  deployId: string;
  jwt: string;
  mode: DeployMode;
  files: string[];
}

export interface DeployFinalizeResponse {
  url: string;
  deployId: string;
  mode: DeployMode;
}

export interface DeploySummary {
  deployId: string;
}

export interface AliasResponse {
  url: string;
  deployId: string;
}

/**
 * Canonical registry row returned by /api/site/register, /api/sites,
 * and PATCH /api/site/{slug}. Mirrors `handler.SiteRow` in artemis.
 * Timestamps are ISO-8601 strings (RFC3339Nano on the wire).
 */
export interface SiteRow {
  slug: string;
  teams: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface RegisterSiteRequest {
  slug: string;
  teams?: string[];
}

export interface UpdateSiteRequest {
  slug: string;
  teams: string[];
}

export interface DeleteSiteRequest {
  slug: string;
}

export type RepoVisibility = "public" | "private";
export type RepoRequestStatus =
  | "pending"
  | "approved"
  | "active"
  | "rejected"
  | "failed";

/**
 * Canonical repo-request row returned by every `/api/repo*` endpoint.
 * camelCase mirrors the artemis Go struct tags (dossier §I/§V6). Optional
 * fields are absent until the lifecycle reaches the relevant state
 * (`url` on active, `error` on failed, `approver`/`rejectReason` on
 * resolution).
 */
export interface RepoRow {
  id: string;
  name: string;
  owner: string;
  visibility: RepoVisibility;
  description?: string;
  template?: string;
  status: RepoRequestStatus;
  url?: string;
  error?: string;
  requestedBy: string;
  approver?: string;
  rejectReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRepoRequestBody {
  name: string;
  visibility?: RepoVisibility;
  description?: string;
  template?: string;
}

export interface ListRepoRequestsQuery {
  status?: string;
  mine?: boolean;
}

export type RepoApproveOutcome = "ok" | "approved_failed";

/**
 * 200 body of POST /api/repo/{id}/approve. `ok` → repo created (status
 * active); `approved_failed` → approval recorded but GitHub creation
 * failed (status failed, error populated). A 409 already_resolved (lost
 * the approval race) surfaces as a ProxyError, not this shape.
 */
export interface RepoApproveResult {
  outcome: RepoApproveOutcome;
  request: RepoRow;
}

export interface ProxyClient {
  whoami(): Promise<WhoAmIResponse>;
  deployInit(req: DeployInitRequest): Promise<DeployInitResponse>;
  deployUpload(req: DeployUploadRequest): Promise<DeployUploadResponse>;
  deployFinalize(req: DeployFinalizeRequest): Promise<DeployFinalizeResponse>;
  siteDeploys(req: { site: string }): Promise<DeploySummary[]>;
  getAlias(req: {
    site: string;
    mode: DeployMode;
  }): Promise<AliasResponse | null>;
  sitePromote(req: {
    site: string;
    deployId?: string;
    expectedCurrent?: string;
  }): Promise<AliasResponse>;
  siteRollback(req: {
    site: string;
    to: string;
    expectedCurrent?: string;
  }): Promise<AliasResponse>;
  registerSite(req: RegisterSiteRequest): Promise<SiteRow>;
  listSites(): Promise<SiteRow[]>;
  updateSite(req: UpdateSiteRequest): Promise<SiteRow>;
  deleteSite(req: DeleteSiteRequest): Promise<void>;
  createRepoRequest(req: CreateRepoRequestBody): Promise<RepoRow>;
  listRepoRequests(req?: ListRepoRequestsQuery): Promise<RepoRow[]>;
  getRepoRequest(id: string): Promise<RepoRow>;
  approveRepoRequest(req: { id: string }): Promise<RepoApproveResult>;
  rejectRepoRequest(req: { id: string; reason?: string }): Promise<RepoRow>;
  listRepoTemplates(): Promise<string[]>;
}

/**
 * Error envelope returned by artemis on non-2xx. `code` is the
 * machine-readable label from `internal/handler/*.go` (`bad_request`,
 * `verify_failed`, `site_unauthorized`, `user_unauthorized`,
 * `r2_put_failed`, etc.).
 */
export class ProxyError extends CliError {
  readonly exitCode: number;
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;

  constructor(
    status: number,
    code: string,
    message: string,
    requestId?: string,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.exitCode = mapExitCode(status);
    this.requestId = requestId;
  }
}

/**
 * Thrown when artemis returns 409 `alias_drift` — the server's
 * observed alias state differs from the caller's `expectedCurrent`
 * CAS guard. Carries the server's authoritative `current` value so
 * callers can offer a one-shot retry with a fresh expectedCurrent.
 *
 * Wire shape: `{error:{code:"alias_drift", message}, site, current}`.
 * Maps to EXIT_USAGE (operator error: stale state).
 */
export class AliasDriftError extends ProxyError {
  readonly current: string;

  constructor(message: string, current: string) {
    super(409, "alias_drift", message);
    this.current = current;
  }
}

function mapExitCode(status: number): number {
  if (status === 401 || status === 403) return EXIT_CREDENTIALS;
  if (status === 422 || status === 0 || status >= 500) return EXIT_STORAGE;
  return EXIT_USAGE;
}

/**
 * Format a proxy or generic error for the per-command catch path.
 * promote/rollback/ls share the same shape:
 *
 *   ProxyError → `<cmd> failed (<code>): <message>`
 *   CliError   → preserve message verbatim
 *   Error      → preserve message verbatim
 *   other      → String(err)
 *
 * Pure — returns `{code, message}` so the caller writes one
 * envelope/exit pair without re-implementing the dispatch.
 */
export function wrapProxyError(
  command: string,
  err: unknown,
): { code: number; message: string; kind?: string; requestId?: string } {
  if (err instanceof ProxyError) {
    let message = `${command} failed (${err.code}): ${err.message}`;
    if (err.code === "user_unauthorized") {
      // A team-membership probe denied the caller. The usual real cause
      // is the active token, not actual non-membership: a token can read
      // /user yet 404 on org membership when it lacks the read:org scope
      // or SAML-SSO authorization. $GITHUB_TOKEN / $GH_TOKEN also shadow
      // `gh auth token` in the identity chain, so a low-scope env token
      // silently wins. Surface that so the failure is actionable.
      message +=
        "\n  hint: the active GitHub token may lack the read:org scope or SSO authorization for the org. " +
        "$GITHUB_TOKEN / $GH_TOKEN override `gh auth token` — run `universe whoami` to check the active identity source, " +
        "then unset them or re-authorize the token (Configure SSO).";
    }
    return {
      code: err.exitCode,
      message,
      kind: err.code,
      requestId: err.requestId,
    };
  }
  if (err instanceof CliError) {
    return { code: err.exitCode, message: err.message };
  }
  if (err instanceof Error) {
    return { code: EXIT_USAGE, message: err.message };
  }
  return { code: EXIT_USAGE, message: String(err) };
}

interface ProxyErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
  };
  current?: unknown;
}

function isProxyErrorEnvelope(value: unknown): value is ProxyErrorEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "error" in (value as Record<string, unknown>)
  );
}

interface ErrorEnvelopeFields {
  code: string;
  message: string;
  current?: string;
}

async function readErrorEnvelope(
  response: Response,
): Promise<ErrorEnvelopeFields> {
  const status = response.status;
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    return {
      code: `http_${status}`,
      message: response.statusText || "request failed",
    };
  }
  if (isProxyErrorEnvelope(raw) && raw.error) {
    const current = typeof raw.current === "string" ? raw.current : undefined;
    return {
      code: raw.error.code ?? `http_${status}`,
      message: raw.error.message ?? response.statusText ?? "request failed",
      ...(current === undefined ? {} : { current }),
    };
  }
  return {
    code: `http_${status}`,
    message: response.statusText || "request failed",
  };
}

function throwProxyError(
  status: number,
  env: ErrorEnvelopeFields,
  requestId?: string,
): never {
  if (status === 409 && env.code === "alias_drift") {
    throw new AliasDriftError(env.message, env.current ?? "");
  }
  throw new ProxyError(status, env.code, env.message, requestId);
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export function createProxyClient(cfg: ProxyClientConfig): ProxyClient {
  const base = stripTrailingSlash(cfg.baseUrl);
  const fetchImpl = cfg.fetch ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = cfg.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const debug = cfg.debug ?? false;

  /**
   * withTimeoutSignal returns a new RequestInit whose signal aborts
   * after `timeoutMs`. If the caller supplied their own signal, the
   * two are merged via `AbortSignal.any` so explicit cancellation
   * still works. `timeoutMs <= 0` disables the timeout.
   */
  function withTimeoutSignal(init: RequestInit): RequestInit {
    if (timeoutMs <= 0) return init;
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    // AbortSignal.any: Node ≥20.3 / bun ≥1.0. Pinned by `engines.node`
    // in package.json (>=24); dropping that floor would silently break
    // this merge path — caller signal would no longer compose with the
    // timeout signal and one of the two cancellations would be lost.
    const merged = init.signal
      ? AbortSignal.any([init.signal, timeoutSignal])
      : timeoutSignal;
    return { ...init, signal: merged };
  }

  function translateFetchError(err: unknown): never {
    if (
      err instanceof DOMException &&
      (err.name === "TimeoutError" || err.name === "AbortError")
    ) {
      throw new ProxyError(
        0,
        "timeout",
        `proxy timed out after ${timeoutMs}ms (${base})`,
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new ProxyError(
      0,
      "network_error",
      `proxy unreachable at ${base}: ${message}`,
    );
  }

  async function userBearer(): Promise<string> {
    const tok = await cfg.getAuthToken();
    return `Bearer ${tok}`;
  }

  async function call<T>(
    url: string,
    init: RequestInit,
    validate?: (raw: unknown) => void,
  ): Promise<T> {
    const startedAt = debug ? Date.now() : 0;
    let response: Response;
    try {
      response = await fetchImpl(url, withTimeoutSignal(init));
    } catch (err) {
      translateFetchError(err);
    }
    if (debug) {
      process.stderr.write(
        `[universe] ${init.method ?? "GET"} ${url} -> ${response.status} (${Date.now() - startedAt}ms)\n`,
      );
    }
    if (!response.ok) {
      const requestId = response.headers.get("x-request-id") ?? undefined;
      const env = await readErrorEnvelope(response);
      throwProxyError(response.status, env, requestId);
    }
    // 204 no-content: cast empty
    if (response.status === 204) {
      return undefined as T;
    }
    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      throw new ProxyError(
        0,
        "malformed_response",
        "proxy returned a non-JSON response body",
      );
    }
    if (validate) {
      try {
        validate(raw);
      } catch (err) {
        const detail = err instanceof Error ? err.message : "invalid shape";
        throw new ProxyError(
          0,
          "malformed_response",
          `proxy returned an unexpected response shape: ${detail}`,
        );
      }
    }
    return raw as T;
  }

  return {
    async whoami() {
      return call<WhoAmIResponse>(`${base}/api/whoami`, {
        method: "GET",
        headers: {
          Authorization: await userBearer(),
          Accept: "application/json",
        },
      });
    },

    async deployInit(req) {
      return call<DeployInitResponse>(`${base}/api/deploy/init`, {
        method: "POST",
        headers: {
          Authorization: await userBearer(),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(req),
      });
    },

    async deployUpload(req) {
      const url = `${base}/api/deploy/${encodeURIComponent(
        req.deployId,
      )}/upload?path=${encodeURIComponent(req.path)}`;
      return call<DeployUploadResponse>(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${req.jwt}`,
          Accept: "application/json",
          "Content-Type": req.contentType ?? "application/octet-stream",
        },
        body: req.body,
      });
    },

    async deployFinalize(req) {
      const url = `${base}/api/deploy/${encodeURIComponent(req.deployId)}/finalize`;
      return call<DeployFinalizeResponse>(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${req.jwt}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode: req.mode, files: req.files }),
      });
    },

    async siteDeploys(req) {
      const url = `${base}/api/site/${encodeURIComponent(req.site)}/deploys`;
      return call<DeploySummary[]>(url, {
        method: "GET",
        headers: {
          Authorization: await userBearer(),
          Accept: "application/json",
        },
      });
    },

    async getAlias(req) {
      const url = `${base}/api/site/${encodeURIComponent(req.site)}/alias/${encodeURIComponent(req.mode)}`;
      let response: Response;
      try {
        response = await fetchImpl(
          url,
          withTimeoutSignal({
            method: "GET",
            headers: {
              Authorization: await userBearer(),
              Accept: "application/json",
            },
          }),
        );
      } catch (err) {
        translateFetchError(err);
      }
      // 404 conflates "site-unknown" and "alias-key-absent" — both mean
      // "no deploy id to read" from caller POV (SPEC §I client surface).
      if (response.status === 404) return null;
      if (!response.ok) {
        const env = await readErrorEnvelope(response);
        throwProxyError(response.status, env);
      }
      return (await response.json()) as AliasResponse;
    },

    async sitePromote(req) {
      const url = `${base}/api/site/${encodeURIComponent(req.site)}/promote`;
      const headers: Record<string, string> = {
        Authorization: await userBearer(),
        Accept: "application/json",
      };
      const body: Record<string, string> = {};
      if (req.deployId !== undefined) body.deployId = req.deployId;
      if (req.expectedCurrent !== undefined)
        body.expectedCurrent = req.expectedCurrent;
      const hasBody = Object.keys(body).length > 0;
      if (hasBody) headers["Content-Type"] = "application/json";
      return call<AliasResponse>(url, {
        method: "POST",
        headers,
        ...(hasBody ? { body: JSON.stringify(body) } : {}),
      });
    },

    async siteRollback(req) {
      const url = `${base}/api/site/${encodeURIComponent(req.site)}/rollback`;
      const body: Record<string, string> = { to: req.to };
      if (req.expectedCurrent !== undefined)
        body.expectedCurrent = req.expectedCurrent;
      return call<AliasResponse>(url, {
        method: "POST",
        headers: {
          Authorization: await userBearer(),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    },

    async registerSite(req) {
      const body: Record<string, unknown> = { slug: req.slug };
      if (req.teams && req.teams.length > 0) {
        body.teams = req.teams;
      }
      return call<SiteRow>(`${base}/api/site/register`, {
        method: "POST",
        headers: {
          Authorization: await userBearer(),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    },

    async listSites() {
      return call<SiteRow[]>(`${base}/api/sites`, {
        method: "GET",
        headers: {
          Authorization: await userBearer(),
          Accept: "application/json",
        },
      });
    },

    async updateSite(req) {
      const url = `${base}/api/site/${encodeURIComponent(req.slug)}`;
      return call<SiteRow>(url, {
        method: "PATCH",
        headers: {
          Authorization: await userBearer(),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ teams: req.teams }),
      });
    },

    async deleteSite(req) {
      const url = `${base}/api/site/${encodeURIComponent(req.slug)}`;
      return call<void>(url, {
        method: "DELETE",
        headers: {
          Authorization: await userBearer(),
          Accept: "application/json",
        },
      });
    },

    async createRepoRequest(req) {
      const body: Record<string, unknown> = { name: req.name };
      if (req.visibility !== undefined) body.visibility = req.visibility;
      if (req.description !== undefined) body.description = req.description;
      // template omitted (never empty string) when blank — V7.
      if (req.template !== undefined && req.template !== "") {
        body.template = req.template;
      }
      return call<RepoRow>(
        `${base}/api/repo`,
        {
          method: "POST",
          headers: {
            Authorization: await userBearer(),
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
        (raw) => repoRowSchema.parse(raw),
      );
    },

    async listRepoRequests(req) {
      const params = new URLSearchParams();
      if (req?.status) params.set("status", req.status);
      if (req?.mine) params.set("mine", "1");
      const qs = params.toString();
      const url = `${base}/api/repos${qs ? `?${qs}` : ""}`;
      return call<RepoRow[]>(
        url,
        {
          method: "GET",
          headers: {
            Authorization: await userBearer(),
            Accept: "application/json",
          },
        },
        (raw) => repoRowArraySchema.parse(raw),
      );
    },

    async getRepoRequest(id) {
      const url = `${base}/api/repo/${encodeURIComponent(id)}`;
      return call<RepoRow>(
        url,
        {
          method: "GET",
          headers: {
            Authorization: await userBearer(),
            Accept: "application/json",
          },
        },
        (raw) => repoRowSchema.parse(raw),
      );
    },

    async approveRepoRequest(req) {
      const url = `${base}/api/repo/${encodeURIComponent(req.id)}/approve`;
      return call<RepoApproveResult>(
        url,
        {
          method: "POST",
          headers: {
            Authorization: await userBearer(),
            Accept: "application/json",
          },
        },
        (raw) => repoApproveResultSchema.parse(raw),
      );
    },

    async rejectRepoRequest(req) {
      const url = `${base}/api/repo/${encodeURIComponent(req.id)}/reject`;
      const body: Record<string, unknown> = {};
      if (req.reason !== undefined) body.reason = req.reason;
      return call<RepoRow>(
        url,
        {
          method: "POST",
          headers: {
            Authorization: await userBearer(),
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
        (raw) => repoRowSchema.parse(raw),
      );
    },

    async listRepoTemplates() {
      const res = await call<{ templates: string[] }>(
        `${base}/api/repo/templates`,
        {
          method: "GET",
          headers: {
            Authorization: await userBearer(),
            Accept: "application/json",
          },
        },
        (raw) => repoTemplatesResponseSchema.parse(raw),
      );
      return res.templates ?? [];
    },
  };
}
