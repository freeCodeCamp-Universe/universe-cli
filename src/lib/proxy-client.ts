import { CliError } from "../errors.js";
import {
  EXIT_CREDENTIALS,
  EXIT_STORAGE,
  EXIT_USAGE,
} from "../output/exit-codes.js";

/**
 * Typed fetch wrapper for the artemis deploy proxy.
 *
 * Mirrors the routes defined in
 * `~/DEV/fCC-U/artemis/internal/server/server.go` and the request /
 * response shapes from `internal/handler/{deploy,site,whoami}.go`.
 *
 *   GET    /api/whoami                                — GitHub bearer
 *   POST   /api/deploy/init                           — GitHub bearer
 *   PUT    /api/deploy/{deployId}/upload?path=<rel>   — Deploy-session JWT
 *   POST   /api/deploy/{deployId}/finalize            — Deploy-session JWT
 *   GET    /api/site/{site}/deploys                   — GitHub bearer
 *   POST   /api/site/{site}/promote                   — GitHub bearer
 *   POST   /api/site/{site}/rollback                  — GitHub bearer
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

export interface ProxyClient {
  whoami(): Promise<WhoAmIResponse>;
  deployInit(req: DeployInitRequest): Promise<DeployInitResponse>;
  deployUpload(req: DeployUploadRequest): Promise<DeployUploadResponse>;
  deployFinalize(req: DeployFinalizeRequest): Promise<DeployFinalizeResponse>;
  siteDeploys(req: { site: string }): Promise<DeploySummary[]>;
  sitePromote(req: { site: string }): Promise<AliasResponse>;
  siteRollback(req: { site: string; to: string }): Promise<AliasResponse>;
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

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.exitCode = mapExitCode(status);
  }
}

function mapExitCode(status: number): number {
  if (status === 401 || status === 403) return EXIT_CREDENTIALS;
  if (status === 422 || status === 0 || status >= 500) return EXIT_STORAGE;
  return EXIT_USAGE;
}

interface ProxyErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
  };
}

function isProxyErrorEnvelope(value: unknown): value is ProxyErrorEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "error" in (value as Record<string, unknown>)
  );
}

async function readErrorEnvelope(
  response: Response,
): Promise<{ code: string; message: string }> {
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
    return {
      code: raw.error.code ?? `http_${status}`,
      message: raw.error.message ?? response.statusText ?? "request failed",
    };
  }
  return {
    code: `http_${status}`,
    message: response.statusText || "request failed",
  };
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export function createProxyClient(cfg: ProxyClientConfig): ProxyClient {
  const base = stripTrailingSlash(cfg.baseUrl);
  const fetchImpl = cfg.fetch ?? globalThis.fetch.bind(globalThis);

  async function userBearer(): Promise<string> {
    const tok = await cfg.getAuthToken();
    return `Bearer ${tok}`;
  }

  async function call<T>(url: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(url, init);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new ProxyError(0, "network_error", `proxy unreachable: ${message}`);
    }
    if (!response.ok) {
      const env = await readErrorEnvelope(response);
      throw new ProxyError(response.status, env.code, env.message);
    }
    // 204 no-content: cast empty
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
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

    async sitePromote(req) {
      const url = `${base}/api/site/${encodeURIComponent(req.site)}/promote`;
      return call<AliasResponse>(url, {
        method: "POST",
        headers: {
          Authorization: await userBearer(),
          Accept: "application/json",
        },
      });
    },

    async siteRollback(req) {
      const url = `${base}/api/site/${encodeURIComponent(req.site)}/rollback`;
      return call<AliasResponse>(url, {
        method: "POST",
        headers: {
          Authorization: await userBearer(),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ to: req.to }),
      });
    },
  };
}
