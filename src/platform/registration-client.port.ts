import type { PlatformManifest } from "../services/platform-manifest-service.js";

// Throws RegistrationError on failure.
interface RegistrationClient {
  register(manifest: PlatformManifest): Promise<RegistrationReceipt>;
}

interface RegistrationReceipt {
  name: string;
  registrationId: string;
}

export type { RegistrationClient, RegistrationReceipt };
