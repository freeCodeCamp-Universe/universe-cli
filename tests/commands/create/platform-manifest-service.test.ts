import type { CreateSelections } from "../../../src/commands/create/prompt/prompt.port.js";
import { PlatformManifestService } from "../../../src/commands/create/platform-manifest-service.js";
import { parsePlatformYaml } from "../../../src/lib/platform-yaml.js";
import { describe, expect, it } from "vitest";

const nodeSelection: CreateSelections = {
  confirmed: true,
  databases: ["redis", "postgresql"],
  framework: "express",
  name: "hello-universe",
  packageManager: "pnpm",
  platformServices: ["email", "auth"],
  runtime: "node",
};

const staticSelection: CreateSelections = {
  confirmed: true,
  databases: [],
  framework: "html-css-js",
  name: "marketing-site",
  packageManager: "pnpm",
  platformServices: [],
  runtime: "static_web",
};

describe(PlatformManifestService, () => {
  it("generates the required app stack fields in stable service order", () => {
    const service = new PlatformManifestService();

    const result = service.generatePlatformManifest(nodeSelection);

    expect(result).toMatchSnapshot();
  });

  // Not yet, they're not compatible with the schema.
  it.skip("emits explicit empty collections when no Node.js services are selected", () => {
    const service = new PlatformManifestService();

    const result = service.generatePlatformManifest({
      ...nodeSelection,
      databases: [],
      framework: "typescript",
      platformServices: [],
    });

    expect(result).toContain("services: []");
    expect(result).toContain("resources: []");
  });

  it("generates the static stack shape without app-only fields", () => {
    const service = new PlatformManifestService();

    const result = service.generatePlatformManifest(staticSelection);

    expect(result).toMatchSnapshot();
  });

  it("Node choices produce a manifest that validates against the schema", () => {
    const service = new PlatformManifestService();

    const yaml = service.generatePlatformManifest(nodeSelection);
    const result = parsePlatformYaml(yaml);

    expect(result).not.toHaveProperty("error");
  });

  it("Static choices produce a manifest that validates against the schema", () => {
    const service = new PlatformManifestService();

    const yaml = service.generatePlatformManifest(staticSelection);
    const result = parsePlatformYaml(yaml);

    expect(result).not.toHaveProperty("error");
  });

  //     it("returns a typed manifest for a valid app manifest", () => {
  //       const service = new PlatformManifestService();
  //       const yaml = service.generatePlatformManifest(nodeSelection);

  //       const result = service.validateManifest(yaml, "");

  //       expect(result.stack).toBe("app");
  //     });

  //     it("returns a typed manifest for a valid static manifest", () => {
  //       const service = new PlatformManifestService();
  //       const yaml = service.generatePlatformManifest(staticSelection);

  //       const result = service.validateManifest(yaml, "");

  //       expect(result.stack).toBe("static");
  //     });

  //     it("throws when a required field is missing", () => {
  //       const service = new PlatformManifestService();

  //       expect(() => service.validateManifest("stack: app\n", "")).toThrow(ManifestInvalidError);
  //     });

  //     it("throws when schemaVersion is not recognised", () => {
  //       const service = new PlatformManifestService();
  //       const yaml = `stack: static
  // schemaVersion: "999"
  // name: hello
  // domain:
  //   preview: hello.preview.example.com
  //   production: hello.example.com
  // environments:
  //   preview:
  //     branch: preview
  //   production:
  //     branch: main
  // `;

  //       expect(() => service.validateManifest(yaml, "")).toThrow(ManifestInvalidError);
  //     });
  //   });
});
