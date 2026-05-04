import type { PlatformManifest } from "../services/platform-manifest-service.js";

// Throws PromotionError on failure.
interface PromoteClient {
  promote(request: PromoteRequest): Promise<PromoteReceipt>;
}

interface PromoteReceipt {
  name: string;
  promotionId: string;
}

interface PromoteRequest {
  manifest: PlatformManifest;
}

export type { PromoteClient, PromoteReceipt, PromoteRequest };
