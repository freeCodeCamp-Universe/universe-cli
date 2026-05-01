import type { AppPlatformManifest } from "../services/platform-manifest-service.js";
import { RollbackError } from "../errors/cli-errors.js";
import { StubRollbackClient } from "./rollback-client.stub.js";

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

describe(StubRollbackClient, () => {
  it("returns rollbackId stub-rollback-<name>-production-1 on the first rollback", async () => {
    const client = new StubRollbackClient();

    const receipt = await client.rollback({ manifest: appManifest });

    expect(receipt.rollbackId).toBe("stub-rollback-my-app-production-1");
  });

  it("returns the project name in the receipt", async () => {
    const client = new StubRollbackClient();

    const receipt = await client.rollback({ manifest: appManifest });

    expect(receipt.name).toBe("my-app");
  });

  it("increments the sequence number on repeated rollbacks for the same project", async () => {
    const client = new StubRollbackClient();

    await client.rollback({ manifest: appManifest });
    const second = await client.rollback({ manifest: appManifest });

    expect(second.rollbackId).toBe("stub-rollback-my-app-production-2");
  });

  it("rejects with RollbackError for the sentinel failure project name", async () => {
    const client = new StubRollbackClient();
    const failureManifest = { ...appManifest, name: "rollback-failure" };

    await expect(client.rollback({ manifest: failureManifest })).rejects.toThrow(RollbackError);
  });

  it("resets state between instances", async () => {
    const first = new StubRollbackClient();
    await first.rollback({ manifest: appManifest });

    const second = new StubRollbackClient();
    const receipt = await second.rollback({ manifest: appManifest });

    expect(receipt.rollbackId).toBe("stub-rollback-my-app-production-1");
  });
});
