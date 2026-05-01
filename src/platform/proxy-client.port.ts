import { CliError } from "../errors/cli-errors.js";
import { EXIT_CREDENTIALS, EXIT_STORAGE, EXIT_USAGE } from "../errors/exit-codes.js";

/**
 * Typed fetch wrapper for the artemis deploy proxy.
 *
 * Mirrors the routes defined in
 * `~/DEV/fCC/artemis/internal/server/server.go` and the request /
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
 * resolver (priority chain lives in `auth/identity-resolver.port.ts`). The
 * deploy-JWT paths take the JWT explicitly because the JWT was minted by
 * `/api/deploy/init` and is bound to a single (login, site, deployId)
 * triple — passing it through the same auth resolver would be a footgun.
 */

interface ProxyClientConfig {
  baseUrl: string;
  getAuthToken: () => Promise<string> | string;
  fetch?: typeof globalThis.fetch;
}

type DeployMode = "preview" | "production";

interface WhoAmIResponse {
  login: string;
  authorizedSites: string[];
}

interface DeployInitRequest {
  site: string;
  sha: string;
  files?: string[];
}

interface DeployInitResponse {
  deployId: string;
  jwt: string;
  expiresAt: string;
}

interface DeployUploadRequest {
  deployId: string;
  jwt: string;
  path: string;
  body: BodyInit;
  contentType?: string;
}

interface DeployUploadResponse {
  received: string;
  key: string;
}

interface DeployFinalizeRequest {
  deployId: string;
  jwt: string;
  mode: DeployMode;
  files: string[];
}

interface DeployFinalizeResponse {
  url: string;
  deployId: string;
  mode: DeployMode;
}

interface DeploySummary {
  deployId: string;
}

interface AliasResponse {
  url: string;
  deployId: string;
}

interface ProxyClient {
  whoami(): Promise<WhoAmIResponse>;
  deployInit(req: DeployInitRequest): Promise<DeployInitResponse>;
  deployUpload(req: DeployUploadRequest): Promise<DeployUploadResponse>;
  deployFinalize(req: DeployFinalizeRequest): Promise<DeployFinalizeResponse>;
  siteDeploys(req: { site: string }): Promise<DeploySummary[]>;
  sitePromote(req: { site: string }): Promise<AliasResponse>;
  siteRollback(req: { site: string; to: string }): Promise<AliasResponse>;
}

const mapExitCode = (status: number): number => {
  if (status === 401 || status === 403) {
    return EXIT_CREDENTIALS;
  }
  if (status === 422 || status === 0 || status >= 500) {
    return EXIT_STORAGE;
  }
  return EXIT_USAGE;
};

/**
 * Error envelope returned by artemis on non-2xx. `code` is the
 * machine-readable label from `internal/handler/*.go` (`bad_request`,
 * `verify_failed`, `site_unauthorized`, `user_unauthorized`,
 * `r2_put_failed`, etc.).
 */
class ProxyError extends CliError {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message, mapExitCode(status));
    this.status = status;
    this.code = code;
    this.name = "ProxyError";
  }
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
const wrapProxyError = (command: string, err: unknown): { code: number; message: string } => {
  if (err instanceof ProxyError) {
    return {
      code: err.exitCode,
      message: `${command} failed (${err.code}): ${err.message}`,
    };
  }
  if (err instanceof CliError) {
    return { code: err.exitCode, message: err.message };
  }
  if (err instanceof Error) {
    return { code: EXIT_USAGE, message: err.message };
  }
  return { code: EXIT_USAGE, message: String(err) };
};

export {
  ProxyError,
  wrapProxyError,
  type AliasResponse,
  type DeployFinalizeRequest,
  type DeployFinalizeResponse,
  type DeployInitRequest,
  type DeployInitResponse,
  type DeployMode,
  type DeploySummary,
  type DeployUploadRequest,
  type DeployUploadResponse,
  type ProxyClient,
  type ProxyClientConfig,
  type WhoAmIResponse,
};
