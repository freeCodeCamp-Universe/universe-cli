import { RegistrationError } from "../errors/cli-errors.js";
import type { RegistrationClient, RegistrationReceipt } from "./registration-client.port.js";
import type { PlatformManifest } from "../services/platform-manifest-service.js";

class StubRegistrationClient implements RegistrationClient {
  private readonly registered = new Set<string>();

  register(manifest: PlatformManifest): Promise<RegistrationReceipt> {
    if (this.registered.has(manifest.name)) {
      return Promise.reject(new RegistrationError(manifest.name, "project is already registered"));
    }

    this.registered.add(manifest.name);

    return Promise.resolve({ name: manifest.name, registrationId: `stub-${manifest.name}` });
  }
}

export { StubRegistrationClient };
