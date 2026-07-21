import { stringify as stringifyYaml } from "yaml";
import type { FrameworkLayerData, PackageManagerLayerData } from "./schemas/layers.js";

const buildComposeYaml = (
  framework: FrameworkLayerData,
  packageManager: PackageManagerLayerData,
): string => {
  const { port } = framework;
  const portMapping = `${port}:${port}`;

  const syncEntries = framework.watchSync.map((entry) => ({
    action: "sync" as const,
    path: entry.path,
    target: entry.target,
  }));

  const rebuildFiles = [...packageManager.manifests, packageManager.lockfile];
  const rebuildEntries = rebuildFiles.map((file) => ({
    action: "rebuild" as const,
    path: `./${file}`,
  }));

  const compose = {
    services: {
      app: {
        build: {
          context: "./",
          target: "dev",
        },
        develop: {
          watch: [...syncEntries, ...rebuildEntries],
        },
        ports: [portMapping],
      },
    },
  };

  return stringifyYaml(compose);
};

const buildDevcontainerComposeYaml = () => `services:
  devcontainer:
    build:
      context: ..
      target: dev
    command: ["sleep", "infinity"]
    volumes:
    # First mount the source
      - type: bind
        source: ..
        target: /app
        consistency: cached
    # Then mount an anonymous volume to hold node_modules. Otherwise the bind mount causes the host node_modules to be used.
      - type: volume
        target: /app/node_modules
`;

const buildDevcontainerJson = () => `{
  "$schema": "https://raw.githubusercontent.com/devcontainers/spec/main/schemas/devContainer.schema.json",
  "dockerComposeFile": ["./docker-compose.yml"],
  "service": "devcontainer",
  "workspaceFolder": "/app"
}`;

export { buildComposeYaml, buildDevcontainerComposeYaml, buildDevcontainerJson };
