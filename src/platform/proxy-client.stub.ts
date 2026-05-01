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
  WhoAmIResponse,
} from "./proxy-client.port.js";

interface StubProxyClientOverrides {
  whoami?: () => Promise<WhoAmIResponse>;
  deployInit?: (req: DeployInitRequest) => Promise<DeployInitResponse>;
  deployUpload?: (req: DeployUploadRequest) => Promise<DeployUploadResponse>;
  deployFinalize?: (req: DeployFinalizeRequest) => Promise<DeployFinalizeResponse>;
  siteDeploys?: (req: { site: string }) => Promise<DeploySummary[]>;
  sitePromote?: (req: { site: string }) => Promise<AliasResponse>;
  siteRollback?: (req: { site: string; to: string }) => Promise<AliasResponse>;
}

class StubProxyClient implements ProxyClient {
  private readonly overrides: StubProxyClientOverrides;

  constructor(overrides: StubProxyClientOverrides = {}) {
    this.overrides = overrides;
  }

  whoami(): Promise<WhoAmIResponse> {
    return (
      this.overrides.whoami?.() ?? Promise.resolve({ authorizedSites: [], login: "stub-user" })
    );
  }

  deployInit(req: DeployInitRequest): Promise<DeployInitResponse> {
    return (
      this.overrides.deployInit?.(req) ??
      Promise.resolve({
        deployId: "stub-deploy-id",
        expiresAt: "2099-01-01T00:00:00Z",
        jwt: "stub-jwt",
      })
    );
  }

  deployUpload(req: DeployUploadRequest): Promise<DeployUploadResponse> {
    return (
      this.overrides.deployUpload?.(req) ??
      Promise.resolve({ key: `stub/${req.path}`, received: req.path })
    );
  }

  deployFinalize(req: DeployFinalizeRequest): Promise<DeployFinalizeResponse> {
    return (
      this.overrides.deployFinalize?.(req) ??
      Promise.resolve({
        deployId: req.deployId,
        mode: req.mode,
        url: "https://stub-site.preview.freecode.camp",
      })
    );
  }

  siteDeploys(req: { site: string }): Promise<DeploySummary[]> {
    return this.overrides.siteDeploys?.(req) ?? Promise.resolve([]);
  }

  sitePromote(req: { site: string }): Promise<AliasResponse> {
    return (
      this.overrides.sitePromote?.(req) ??
      Promise.resolve({ deployId: "stub-deploy-id", url: "https://stub-site.freecode.camp" })
    );
  }

  siteRollback(req: { site: string; to: string }): Promise<AliasResponse> {
    return (
      this.overrides.siteRollback?.(req) ??
      Promise.resolve({ deployId: req.to, url: "https://stub-site.freecode.camp" })
    );
  }
}

export { StubProxyClient };
