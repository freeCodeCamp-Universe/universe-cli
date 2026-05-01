import { DeploymentError } from "../errors/cli-errors.js";
import type { DeployClient, DeployReceipt, DeployRequest } from "./deploy-client.port.js";

const SENTINEL_FAILURE_NAME = "deploy-failure";

class StubDeployClient implements DeployClient {
  private readonly deployCounts = new Map<string, number>();

  deploy(request: DeployRequest): Promise<DeployReceipt> {
    const { manifest } = request;

    if (manifest.name === SENTINEL_FAILURE_NAME) {
      return Promise.reject(
        new DeploymentError(manifest.name, "deployment failed (sentinel fixture)"),
      );
    }

    const count = (this.deployCounts.get(manifest.name) ?? 0) + 1;
    this.deployCounts.set(manifest.name, count);

    return Promise.resolve({
      deploymentId: `stub-${manifest.name}-preview-${count}`,
      name: manifest.name,
    });
  }
}

export { StubDeployClient };
