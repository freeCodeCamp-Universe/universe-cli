import type { AppPlatformManifest } from "../services/platform-manifest-service.js";
import { ListError } from "../errors/cli-errors.js";
import { StubListClient } from "./list-client.stub.js";

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

describe(StubListClient, () => {
  it("returns the project name in the response", async () => {
    const client = new StubListClient();

    const response = await client.getList({ manifest: appManifest });

    expect(response.name).toBe("my-app");
  });

  it("returns a non-empty deterministic list of deployments", async () => {
    const client = new StubListClient();

    const response = await client.getList({ manifest: appManifest });

    expect(response.deployments.length).toBeGreaterThan(0);
  });

  it("returns deployments with deploymentId, state, and deployedAt fields", async () => {
    const client = new StubListClient();

    const response = await client.getList({ manifest: appManifest });
    const [entry] = response.deployments;

    expect(entry).toBeDefined();
    expectTypeOf(entry!.deploymentId).toBeString();
    expectTypeOf(entry!.state).toBeString();
    expectTypeOf(entry!.deployedAt).toBeString();
  });

  it("returns the same deployments for repeated calls", async () => {
    const client = new StubListClient();

    const first = await client.getList({ manifest: appManifest });
    const second = await client.getList({ manifest: appManifest });

    expect(first.deployments).toStrictEqual(second.deployments);
  });

  it("rejects with ListError for the sentinel failure project name", async () => {
    const client = new StubListClient();
    const failureManifest = { ...appManifest, name: "list-failure" };

    await expect(client.getList({ manifest: failureManifest })).rejects.toThrow(ListError);
  });

  it("returns the same deployments from separate instances", async () => {
    const first = new StubListClient();
    const second = new StubListClient();

    const firstResponse = await first.getList({ manifest: appManifest });
    const secondResponse = await second.getList({ manifest: appManifest });

    expect(firstResponse.deployments).toStrictEqual(secondResponse.deployments);
  });
});
