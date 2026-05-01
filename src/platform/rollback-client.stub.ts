import { RollbackError } from "../errors/cli-errors.js";
import type { RollbackClient, RollbackReceipt, RollbackRequest } from "./rollback-client.port.js";

const SENTINEL_FAILURE_NAME = "rollback-failure";

class StubRollbackClient implements RollbackClient {
  private readonly rollbackCounts = new Map<string, number>();

  rollback(request: RollbackRequest): Promise<RollbackReceipt> {
    const { manifest } = request;

    if (manifest.name === SENTINEL_FAILURE_NAME) {
      return Promise.reject(new RollbackError(manifest.name, "rollback failed (sentinel fixture)"));
    }

    const count = (this.rollbackCounts.get(manifest.name) ?? 0) + 1;
    this.rollbackCounts.set(manifest.name, count);

    return Promise.resolve({
      name: manifest.name,
      rollbackId: `stub-rollback-${manifest.name}-production-${count}`,
    });
  }
}

export { StubRollbackClient };
