import type { AppPlatformManifest } from "../services/platform-manifest-service.js";
import { DeploymentError } from "../errors/cli-errors.js";
import { StubDeployClient } from "./deploy-client.stub.js";

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

describe(StubDeployClient, () => {
  it("returns deploymentId stub-<name>-preview-1 on the first deploy", async () => {
    const client = new StubDeployClient();

    const receipt = await client.deploy({ manifest: appManifest });

    expect(receipt.deploymentId).toBe("stub-my-app-preview-1");
  });

  it("returns the project name in the receipt", async () => {
    const client = new StubDeployClient();

    const receipt = await client.deploy({ manifest: appManifest });

    expect(receipt.name).toBe("my-app");
  });

  it("increments the sequence number on repeated deploys for the same project", async () => {
    const client = new StubDeployClient();

    await client.deploy({ manifest: appManifest });
    const second = await client.deploy({ manifest: appManifest });

    expect(second.deploymentId).toBe("stub-my-app-preview-2");
  });

  it("rejects with DeploymentError for the sentinel failure project name", async () => {
    const client = new StubDeployClient();
    const failureManifest = { ...appManifest, name: "deploy-failure" };

    await expect(client.deploy({ manifest: failureManifest })).rejects.toThrow(DeploymentError);
  });

  it("resets state between instances", async () => {
    const first = new StubDeployClient();
    await first.deploy({ manifest: appManifest });

    const second = new StubDeployClient();
    const receipt = await second.deploy({ manifest: appManifest });

    expect(receipt.deploymentId).toBe("stub-my-app-preview-1");
  });
});
