import type { AppPlatformManifest } from "../services/platform-manifest-service.js";
import { StatusError } from "../errors/cli-errors.js";
import { StubStatusClient } from "./status-client.stub.js";

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

describe(StubStatusClient, () => {
  it("returns the project name and environment in the response", async () => {
    const client = new StubStatusClient();

    const response = await client.getStatus({ environment: "preview", manifest: appManifest });

    expect(response.name).toBe("my-app");
    expect(response.environment).toBe("preview");
  });

  it("returns a deterministic state field", async () => {
    const client = new StubStatusClient();

    const response = await client.getStatus({ environment: "preview", manifest: appManifest });

    expect(response.state).toBe("ACTIVE");
  });

  it("returns a deterministic updatedAt field as an ISO string", async () => {
    const client = new StubStatusClient();

    const response = await client.getStatus({ environment: "preview", manifest: appManifest });

    expectTypeOf(response.updatedAt).toBeString();
    expect(response.updatedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("returns the same snapshot for repeated calls", async () => {
    const client = new StubStatusClient();

    const first = await client.getStatus({ environment: "preview", manifest: appManifest });
    const second = await client.getStatus({ environment: "preview", manifest: appManifest });

    expect(first).toStrictEqual(second);
  });

  it("rejects with StatusError for the sentinel failure project name", async () => {
    const client = new StubStatusClient();
    const failureManifest = { ...appManifest, name: "status-failure" };

    await expect(
      client.getStatus({ environment: "preview", manifest: failureManifest }),
    ).rejects.toThrow(StatusError);
  });

  it("returns the same snapshot from separate instances", async () => {
    const first = new StubStatusClient();
    const second = new StubStatusClient();

    const firstResponse = await first.getStatus({ environment: "preview", manifest: appManifest });
    const secondResponse = await second.getStatus({
      environment: "preview",
      manifest: appManifest,
    });

    expect(firstResponse).toStrictEqual(secondResponse);
  });
});
