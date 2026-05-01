import { ListError } from "../errors/cli-errors.js";
import type { DeploymentEntry, ListClient, ListRequest, ListResponse } from "./list-client.port.js";

const SENTINEL_FAILURE_NAME = "list-failure";

const STUB_DEPLOYMENTS: DeploymentEntry[] = [
  { deployedAt: "2026-01-01T00:00:00.000Z", deploymentId: "deploy-stub-001", state: "ACTIVE" },
  { deployedAt: "2025-12-01T00:00:00.000Z", deploymentId: "deploy-stub-002", state: "INACTIVE" },
];

class StubListClient implements ListClient {
  getList(request: ListRequest): Promise<ListResponse> {
    const { manifest } = request;

    if (manifest.name === SENTINEL_FAILURE_NAME) {
      return Promise.reject(
        new ListError(manifest.name, "list retrieval failed (sentinel fixture)"),
      );
    }

    return Promise.resolve({
      deployments: STUB_DEPLOYMENTS,
      name: manifest.name,
    });
  }
}

export { StubListClient };
