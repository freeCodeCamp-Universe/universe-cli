import { StatusError } from "../errors/cli-errors.js";
import type { StatusClient, StatusRequest, StatusResponse } from "./status-client.port.js";

const SENTINEL_FAILURE_NAME = "status-failure";

const STUB_UPDATED_AT = "2026-01-01T00:00:00.000Z";

class StubStatusClient implements StatusClient {
  getStatus(request: StatusRequest): Promise<StatusResponse> {
    const { environment, manifest } = request;

    if (manifest.name === SENTINEL_FAILURE_NAME) {
      return Promise.reject(
        new StatusError(manifest.name, "status retrieval failed (sentinel fixture)"),
      );
    }

    return Promise.resolve({
      environment,
      name: manifest.name,
      state: "ACTIVE",
      updatedAt: STUB_UPDATED_AT,
    });
  }
}

export { StubStatusClient };
