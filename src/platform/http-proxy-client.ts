import { ProxyError } from "./proxy-client.port.js";
import type {
  AliasResponse,
  DeployFinalizeRequest,
  DeployFinalizeResponse,
  DeployInitRequest,
  DeployInitResponse,
  DeployUploadRequest,
  DeployUploadResponse,
  DeploySummary,
  ProxyClient,
  ProxyClientConfig,
  WhoAmIResponse,
} from "./proxy-client.port.js";

interface ProxyErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
  };
}

const isProxyErrorEnvelope = (value: unknown): value is ProxyErrorEnvelope =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  "error" in (value as Record<string, unknown>);

const readErrorEnvelope = async (
  response: Response,
): Promise<{ code: string; message: string }> => {
  const { status } = response;
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
};

const stripTrailingSlash = (url: string): string => (url.endsWith("/") ? url.slice(0, -1) : url);

const createProxyClient = (cfg: ProxyClientConfig): ProxyClient => {
  const base = stripTrailingSlash(cfg.baseUrl);
  const fetchImpl = cfg.fetch ?? globalThis.fetch.bind(globalThis);

  const userBearer = async (): Promise<string> => {
    const tok = await cfg.getAuthToken();
    return `Bearer ${tok}`;
  };

  const call = async <T>(url: string, init: RequestInit): Promise<T> => {
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
  };

  return {
    deployFinalize: (req: DeployFinalizeRequest): Promise<DeployFinalizeResponse> => {
      const url = `${base}/api/deploy/${encodeURIComponent(req.deployId)}/finalize`;
      return call<DeployFinalizeResponse>(url, {
        body: JSON.stringify({ files: req.files, mode: req.mode }),
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${req.jwt}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      });
    },

    deployInit: async (req: DeployInitRequest): Promise<DeployInitResponse> =>
      call<DeployInitResponse>(`${base}/api/deploy/init`, {
        body: JSON.stringify(req),
        headers: {
          Accept: "application/json",
          Authorization: await userBearer(),
          "Content-Type": "application/json",
        },
        method: "POST",
      }),

    deployUpload: (req: DeployUploadRequest): Promise<DeployUploadResponse> => {
      const url = `${base}/api/deploy/${encodeURIComponent(req.deployId)}/upload?path=${encodeURIComponent(req.path)}`;
      return call<DeployUploadResponse>(url, {
        body: req.body,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${req.jwt}`,
          "Content-Type": req.contentType ?? "application/octet-stream",
        },
        method: "PUT",
      });
    },

    siteDeploys: async (req: { site: string }): Promise<DeploySummary[]> => {
      const url = `${base}/api/site/${encodeURIComponent(req.site)}/deploys`;
      return call<DeploySummary[]>(url, {
        headers: {
          Accept: "application/json",
          Authorization: await userBearer(),
        },
        method: "GET",
      });
    },

    sitePromote: async (req: { site: string }): Promise<AliasResponse> => {
      const url = `${base}/api/site/${encodeURIComponent(req.site)}/promote`;
      return call<AliasResponse>(url, {
        headers: {
          Accept: "application/json",
          Authorization: await userBearer(),
        },
        method: "POST",
      });
    },

    siteRollback: async (req: { site: string; to: string }): Promise<AliasResponse> => {
      const url = `${base}/api/site/${encodeURIComponent(req.site)}/rollback`;
      return call<AliasResponse>(url, {
        body: JSON.stringify({ to: req.to }),
        headers: {
          Accept: "application/json",
          Authorization: await userBearer(),
          "Content-Type": "application/json",
        },
        method: "POST",
      });
    },

    whoami: async (): Promise<WhoAmIResponse> =>
      call<WhoAmIResponse>(`${base}/api/whoami`, {
        headers: {
          Accept: "application/json",
          Authorization: await userBearer(),
        },
        method: "GET",
      }),
  };
};

export { createProxyClient };
