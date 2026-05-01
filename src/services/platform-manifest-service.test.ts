import { z } from "zod";
import type { CreateSelections } from "../commands/create/prompt/prompt.port.js";
import { PlatformManifestSchema, PlatformManifestService } from "./platform-manifest-service.js";
import { ManifestInvalidError } from "../errors/cli-errors.js";

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

  it("emits explicit empty collections when no Node.js services are selected", () => {
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

  it("can export PlatformManifestSchema to JSON Schema", () => {
    const jsonSchema = z.toJSONSchema(PlatformManifestSchema);

    expect(jsonSchema).toBeDefined();
  });

  describe("validateManifest", () => {
    it("returns a typed manifest for a valid app manifest", () => {
      const service = new PlatformManifestService();
      const yaml = service.generatePlatformManifest(nodeSelection);

      const result = service.validateManifest(yaml, "");

      expect(result.stack).toBe("app");
    });

    it("returns a typed manifest for a valid static manifest", () => {
      const service = new PlatformManifestService();
      const yaml = service.generatePlatformManifest(staticSelection);

      const result = service.validateManifest(yaml, "");

      expect(result.stack).toBe("static");
    });

    it("throws when a required field is missing", () => {
      const service = new PlatformManifestService();

      expect(() => service.validateManifest("stack: app\n", "")).toThrow(ManifestInvalidError);
    });

    it("throws when schemaVersion is not recognised", () => {
      const service = new PlatformManifestService();
      const yaml = `stack: static
schemaVersion: "999"
name: hello
domain:
  preview: hello.preview.example.com
  production: hello.example.com
environments:
  preview:
    branch: preview
  production:
    branch: main
`;

      expect(() => service.validateManifest(yaml, "")).toThrow(ManifestInvalidError);
    });
  });
});
