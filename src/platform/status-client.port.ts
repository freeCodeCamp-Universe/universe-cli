import type { PlatformManifest } from "../services/platform-manifest-service.js";

// Throws StatusError on failure.
interface StatusClient {
  getStatus(request: StatusRequest): Promise<StatusResponse>;
}

type StatusState = "ACTIVE" | "DEPLOYING" | "FAILED" | "INACTIVE";

interface StatusRequest {
  environment: string;
  manifest: PlatformManifest;
}

interface StatusResponse {
  environment: string;
  name: string;
  state: StatusState;
  updatedAt: string;
}

export type { StatusClient, StatusRequest, StatusResponse, StatusState };
