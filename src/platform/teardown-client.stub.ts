import { TeardownError } from "../errors/cli-errors.js";
import type { TeardownClient, TeardownReceipt, TeardownRequest } from "./teardown-client.port.js";

const SENTINEL_FAILURE_NAME = "teardown-failure";

class StubTeardownClient implements TeardownClient {
  private readonly teardownCounts = new Map<string, number>();

  teardown(request: TeardownRequest): Promise<TeardownReceipt> {
    const { manifest } = request;

    if (manifest.name === SENTINEL_FAILURE_NAME) {
      return Promise.reject(new TeardownError(manifest.name, "teardown failed (sentinel fixture)"));
    }

    const count = (this.teardownCounts.get(manifest.name) ?? 0) + 1;
    this.teardownCounts.set(manifest.name, count);

    return Promise.resolve({
      name: manifest.name,
      teardownId: `stub-teardown-${manifest.name}-${count}`,
    });
  }
}

export { StubTeardownClient };
