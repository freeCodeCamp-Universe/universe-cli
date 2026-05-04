import type { PlatformManifest } from "../services/platform-manifest-service.js";

// Throws TeardownError on failure.
interface TeardownClient {
  teardown(request: TeardownRequest): Promise<TeardownReceipt>;
}

interface TeardownReceipt {
  name: string;
  teardownId: string;
}

interface TeardownRequest {
  manifest: PlatformManifest;
}

export type { TeardownClient, TeardownReceipt, TeardownRequest };
