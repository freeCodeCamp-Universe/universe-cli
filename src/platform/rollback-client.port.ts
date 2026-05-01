import type { PlatformManifest } from "../services/platform-manifest-service.js";

// Throws RollbackError on failure.
interface RollbackClient {
  rollback(request: RollbackRequest): Promise<RollbackReceipt>;
}

interface RollbackReceipt {
  name: string;
  rollbackId: string;
}

interface RollbackRequest {
  manifest: PlatformManifest;
}

export type { RollbackClient, RollbackReceipt, RollbackRequest };
