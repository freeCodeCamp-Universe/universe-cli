import { PromotionError } from "../errors/cli-errors.js";
import type { PromoteClient, PromoteReceipt, PromoteRequest } from "./promote-client.port.js";

const SENTINEL_FAILURE_NAME = "promote-failure";

class StubPromoteClient implements PromoteClient {
  private readonly promoteCounts = new Map<string, number>();

  promote(request: PromoteRequest): Promise<PromoteReceipt> {
    const { manifest } = request;

    if (manifest.name === SENTINEL_FAILURE_NAME) {
      return Promise.reject(
        new PromotionError(manifest.name, "promotion failed (sentinel fixture)"),
      );
    }

    const count = (this.promoteCounts.get(manifest.name) ?? 0) + 1;
    this.promoteCounts.set(manifest.name, count);

    return Promise.resolve({
      name: manifest.name,
      promotionId: `stub-promote-${manifest.name}-production-${count}`,
    });
  }
}

export { StubPromoteClient };
