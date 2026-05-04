import type { PlatformManifest } from "../services/platform-manifest-service.js";

// Throws DeploymentError on failure.
interface DeployClient {
  deploy(request: DeployRequest): Promise<DeployReceipt>;
}

interface DeployReceipt {
  deploymentId: string;
  name: string;
}

interface DeployRequest {
  manifest: PlatformManifest;
}

export type { DeployClient, DeployReceipt, DeployRequest };
