import type { AppPlatformManifest } from "../services/platform-manifest-service.js";
import { PromotionError } from "../errors/cli-errors.js";
import { StubPromoteClient } from "./promote-client.stub.js";

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

describe(StubPromoteClient, () => {
  it("returns promotionId stub-promote-<name>-production-1 on the first promote", async () => {
    const client = new StubPromoteClient();

    const receipt = await client.promote({ manifest: appManifest });

    expect(receipt.promotionId).toBe("stub-promote-my-app-production-1");
  });

  it("returns the project name in the receipt", async () => {
    const client = new StubPromoteClient();

    const receipt = await client.promote({ manifest: appManifest });

    expect(receipt.name).toBe("my-app");
  });

  it("increments the sequence number on repeated promotes for the same project", async () => {
    const client = new StubPromoteClient();

    await client.promote({ manifest: appManifest });
    const second = await client.promote({ manifest: appManifest });

    expect(second.promotionId).toBe("stub-promote-my-app-production-2");
  });

  it("rejects with PromotionError for the sentinel failure project name", async () => {
    const client = new StubPromoteClient();
    const failureManifest = { ...appManifest, name: "promote-failure" };

    await expect(client.promote({ manifest: failureManifest })).rejects.toThrow(PromotionError);
  });

  it("resets state between instances", async () => {
    const first = new StubPromoteClient();
    await first.promote({ manifest: appManifest });

    const second = new StubPromoteClient();
    const receipt = await second.promote({ manifest: appManifest });

    expect(receipt.promotionId).toBe("stub-promote-my-app-production-1");
  });
});
