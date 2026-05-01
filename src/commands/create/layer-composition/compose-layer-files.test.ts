import { LayerConflictError } from "../../../errors/cli-errors.js";
import { composeLayerFiles } from "./compose-layer-files.js";
import type { ResolvedLayer } from "./resolve-ordered-layers.js";

describe(composeLayerFiles, () => {
  describe("conflict detection", () => {
    it("throws LayerConflictError for a cross-stage non-config file collision", () => {
      const layers: ResolvedLayer[] = [
        { files: { "README.md": "# Hello\n" }, layerType: "always", name: "always" },
        { files: { "README.md": "# Node\n" }, layerType: "runtime", name: "runtime/node" },
      ];

      expect(() => composeLayerFiles(layers)).toThrow(LayerConflictError);
    });

    it("throws LayerConflictError for a same-stage file collision", () => {
      const layers: ResolvedLayer[] = [
        {
          files: { "config/shared.txt": "auth" },
          layerType: "services",
          name: "services/auth",
        },
        {
          files: { "config/shared.txt": "email" },
          layerType: "services",
          name: "services/email",
        },
      ];

      expect(() => composeLayerFiles(layers)).toThrow(LayerConflictError);
    });
  });

  describe("merging JSON", () => {
    it("merges two package.json layers and sorts keys alphabetically", () => {
      const layers: ResolvedLayer[] = [
        {
          files: { "package.json": '{"scripts":{"build":"tsc"}}' },
          layerType: "runtime",
          name: "runtime/node",
        },
        {
          files: { "package.json": '{"dependencies":{"express":"5.1.0"}}' },
          layerType: "frameworks",
          name: "frameworks/express",
        },
      ];

      expect(composeLayerFiles(layers)["package.json"]).toBe(
        '{"dependencies":{"express":"5.1.0"},"scripts":{"build":"tsc"}}',
      );
    });

    it("later layer values win for conflicting scalar keys", () => {
      const layers: ResolvedLayer[] = [
        {
          files: { "package.json": '{"scripts":{"dev":"node src/index.js"}}' },
          layerType: "runtime",
          name: "runtime/node",
        },
        {
          files: { "package.json": '{"scripts":{"dev":"node --watch src/index.js"}}' },
          layerType: "frameworks",
          name: "frameworks/express",
        },
      ];

      expect(composeLayerFiles(layers)["package.json"]).toBe(
        '{"scripts":{"dev":"node --watch src/index.js"}}',
      );
    });

    it("merges JSON and YAML config files in the same composition", () => {
      const layers: ResolvedLayer[] = [
        {
          files: {
            "docker-compose.yaml": "services:\n  app:\n    image: node:22\n",
            "package.json": '{"scripts":{"build":"tsc"}}',
          },
          layerType: "runtime",
          name: "runtime/node",
        },
        {
          files: {
            "docker-compose.yaml": "services:\n  app:\n    ports:\n      - '3000:3000'\n",
            "package.json": '{"dependencies":{"express":"5.1.0"}}',
          },
          layerType: "frameworks",
          name: "frameworks/express",
        },
      ];

      const result = composeLayerFiles(layers);

      expect(result["package.json"]).toBe(
        '{"dependencies":{"express":"5.1.0"},"scripts":{"build":"tsc"}}',
      );
      expect(result["docker-compose.yaml"]).toContain("image: node:22");
      expect(result["docker-compose.yaml"]).toContain("3000:3000");
      expect(result["docker-compose.yaml"]).not.toContain("{");
    });
  });

  describe("merging YAML", () => {
    it("merges .yaml config files and emits valid YAML", () => {
      const layers: ResolvedLayer[] = [
        {
          files: { "docker-compose.yaml": "version: '3'\nservices:\n  app:\n    image: node:22\n" },
          layerType: "runtime",
          name: "runtime/node",
        },
        {
          files: {
            "docker-compose.yaml": "services:\n  app:\n    ports:\n      - '3000:3000'\n",
          },
          layerType: "frameworks",
          name: "frameworks/express",
        },
      ];

      const output = composeLayerFiles(layers)["docker-compose.yaml"];

      expect(output).toBeDefined();
      expect(output).toContain("image: node:22");
      expect(output).toContain("3000:3000");
      expect(output).not.toContain("{");
    });

    it("merges .yml config files and emits valid YAML", () => {
      const layers: ResolvedLayer[] = [
        {
          files: { "config.yml": "env: base\nshared: common\n" },
          layerType: "runtime",
          name: "runtime/node",
        },
        {
          files: { "config.yml": "env: extended\n" },
          layerType: "frameworks",
          name: "frameworks/express",
        },
      ];

      const output = composeLayerFiles(layers)["config.yml"];

      expect(output).toContain("env: extended");
      expect(output).toContain("shared: common");
      expect(output).not.toContain("{");
    });
  });

  describe("preinstall injection", () => {
    it("injects preinstall script into existing package.json", () => {
      const layers: ResolvedLayer[] = [
        {
          files: { "package.json": '{"scripts":{"build":"tsc"}}' },
          layerType: "runtime",
          name: "runtime/node",
        },
      ];

      expect(composeLayerFiles(layers, "npx only-allow pnpm")["package.json"]).toBe(
        '{"scripts":{"build":"tsc","preinstall":"npx only-allow pnpm"}}',
      );
    });

    it("does not inject preinstall when package.json is absent", () => {
      const layers: ResolvedLayer[] = [
        {
          files: { "README.md": "# Hello\n" },
          layerType: "always",
          name: "always",
        },
      ];

      const result = composeLayerFiles(layers, "npx only-allow pnpm");

      expect(result["package.json"]).toBeUndefined();
    });

    it("leaves files unchanged when pmPreinstall is undefined", () => {
      const layers: ResolvedLayer[] = [
        {
          files: { "package.json": '{"scripts":{"build":"tsc"}}' },
          layerType: "runtime",
          name: "runtime/node",
        },
      ];

      expect(composeLayerFiles(layers)["package.json"]).toBe('{"scripts":{"build":"tsc"}}');
    });
  });
});
