import { RegistrationError } from "../errors/cli-errors.js";
import type {
  AppPlatformManifest,
  StaticPlatformManifest,
} from "../services/platform-manifest-service.js";
import { StubRegistrationClient } from "./registration-client.stub.js";

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

const staticManifest: StaticPlatformManifest = {
  domain: { preview: "my-site.preview.example.com", production: "my-site.example.com" },
  environments: { preview: { branch: "preview" }, production: { branch: "main" } },
  name: "my-site",
  schemaVersion: "1",
  stack: "static",
};

describe(StubRegistrationClient, () => {
  it("returns a receipt with the project name and a deterministic registration id", async () => {
    const client = new StubRegistrationClient();

    const receipt = await client.register(appManifest);

    expect(receipt.name).toBe("my-app");
    expect(receipt.registrationId).toBe("stub-my-app");
  });

  it("also registers static manifests successfully", async () => {
    const client = new StubRegistrationClient();

    const receipt = await client.register(staticManifest);

    expect(receipt.name).toBe("my-site");
    expect(receipt.registrationId).toBe("stub-my-site");
  });

  it("throws RegistrationError on a second registration for the same project name", async () => {
    const client = new StubRegistrationClient();
    await client.register(appManifest);

    await expect(client.register(appManifest)).rejects.toThrow(RegistrationError);
  });

  it("resets state between instances", async () => {
    const first = new StubRegistrationClient();
    await first.register(appManifest);

    const second = new StubRegistrationClient();
    const receipt = await second.register(appManifest);

    expect(receipt.registrationId).toBe("stub-my-app");
  });
});
