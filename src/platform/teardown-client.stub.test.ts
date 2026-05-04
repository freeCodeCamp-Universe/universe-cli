import type { AppPlatformManifest } from "../services/platform-manifest-service.js";
import { TeardownError } from "../errors/cli-errors.js";
import { StubTeardownClient } from "./teardown-client.stub.js";

const appManifest: AppPlatformManifest = {
  domain: { preview: "my-app.preview.example.com", production: "my-app.example.com" },
  environments: { preview: { branch: "preview" }, production: { branch: "main" } },
  name: "my-app",
  owner: "platform-engineering",
  resources: [],
  schemaVersion: "1",
  services: [],
  stack: "app",
};

describe(StubTeardownClient, () => {
  it("returns teardownId stub-teardown-<name>-1 on the first teardown", async () => {
    const client = new StubTeardownClient();

    const receipt = await client.teardown({ manifest: appManifest });

    expect(receipt.teardownId).toBe("stub-teardown-my-app-1");
  });

  it("returns the project name in the receipt", async () => {
    const client = new StubTeardownClient();

    const receipt = await client.teardown({ manifest: appManifest });

    expect(receipt.name).toBe("my-app");
  });

  it("increments the sequence number on repeated teardowns for the same project", async () => {
    const client = new StubTeardownClient();

    await client.teardown({ manifest: appManifest });
    const second = await client.teardown({ manifest: appManifest });

    expect(second.teardownId).toBe("stub-teardown-my-app-2");
  });

  it("rejects with TeardownError for the sentinel failure project name", async () => {
    const client = new StubTeardownClient();
    const failureManifest = { ...appManifest, name: "teardown-failure" };

    await expect(client.teardown({ manifest: failureManifest })).rejects.toThrow(TeardownError);
  });

  it("resets state between instances", async () => {
    const first = new StubTeardownClient();
    await first.teardown({ manifest: appManifest });

    const second = new StubTeardownClient();
    const receipt = await second.teardown({ manifest: appManifest });

    expect(receipt.teardownId).toBe("stub-teardown-my-app-1");
  });
});
