import { stringify as stringifyYaml } from "yaml";
import type { FrameworkLayerData, PackageManagerLayerData } from "./schemas/layers.js";

const buildComposeDevYaml = (
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

export { buildComposeDevYaml };
