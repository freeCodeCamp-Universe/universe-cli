import type { AppPlatformManifest } from "../services/platform-manifest-service.js";
import { LogsError } from "../errors/cli-errors.js";
import { StubLogsClient } from "./logs-client.stub.js";

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

describe(StubLogsClient, () => {
  it("returns the project name and environment in the response", async () => {
    const client = new StubLogsClient();

    const response = await client.getLogs({ environment: "preview", manifest: appManifest });

    expect(response.name).toBe("my-app");
    expect(response.environment).toBe("preview");
  });

  it("returns a non-empty deterministic list of log entries", async () => {
    const client = new StubLogsClient();

    const response = await client.getLogs({ environment: "preview", manifest: appManifest });

    expect(response.entries.length).toBeGreaterThan(0);
  });

  it("returns entries with timestamp, level, and message fields", async () => {
    const client = new StubLogsClient();

    const response = await client.getLogs({ environment: "preview", manifest: appManifest });
    const [entry] = response.entries;

    expect(entry).toBeDefined();
    expectTypeOf(entry!.timestamp).toBeString();
    expectTypeOf(entry!.level).toBeString();
    expectTypeOf(entry!.message).toBeString();
  });

  it("returns the same entries for repeated calls", async () => {
    const client = new StubLogsClient();

    const first = await client.getLogs({ environment: "preview", manifest: appManifest });
    const second = await client.getLogs({ environment: "preview", manifest: appManifest });

    expect(first.entries).toStrictEqual(second.entries);
  });

  it("rejects with LogsError for the sentinel failure project name", async () => {
    const client = new StubLogsClient();
    const failureManifest = { ...appManifest, name: "logs-failure" };

    await expect(
      client.getLogs({ environment: "preview", manifest: failureManifest }),
    ).rejects.toThrow(LogsError);
  });

  it("returns the same entries from separate instances", async () => {
    const first = new StubLogsClient();
    const second = new StubLogsClient();

    const firstResponse = await first.getLogs({ environment: "preview", manifest: appManifest });
    const secondResponse = await second.getLogs({ environment: "preview", manifest: appManifest });

    expect(firstResponse.entries).toStrictEqual(secondResponse.entries);
  });
});
