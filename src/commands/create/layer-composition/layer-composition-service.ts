import type { CreateSelections } from "../prompt/prompt.port.js";
import {
  buildComposeDevYaml,
  buildDevcontainerComposeYaml,
  buildDevcontainerJson,
} from "./docker-config.js";
import { composeLayerFiles } from "./compose-layer-files.js";
import databaseLayer from "./layers/database.json" with { type: "json" };
import serviceLayer from "./layers/service.json" with { type: "json" };
import { LayerTemplateRenderer } from "./layer-template-renderer.js";
import type { TemplateContext } from "./layer-template-renderer.js";
import { getLabel } from "./labels.js";
import { resolveOrderedLayers } from "./resolve-ordered-layers.js";
import type {
  LayerData,
  LayerRegistry,
  LayerType,
  ResolvedLayer,
} from "./resolve-ordered-layers.js";

import alwaysLayer from "./layers/always.json" with { type: "json" };
import frameworksLayer from "./layers/framework.json" with { type: "json" };
import packageManagersLayer from "./layers/package-manager.json" with { type: "json" };
import runtimeLayer from "./layers/runtime.json" with { type: "json" };
import type {
  FrameworkLayerData,
  PackageManagerLayerData,
  RuntimeLayerData,
} from "./schemas/layers.js";

interface ResolvedLayerSet {
  files: Record<string, string>;
  layers: ResolvedLayer[];
}

interface LayerComposer {
  resolveLayers(input: CreateSelections): ResolvedLayerSet;
}

interface DockerfileData {
  baseImage: string;
  devCmd: string[];
  devCopySource: string;
  devInstall: string;
  pmInstall: string;
}

const buildDockerfileData = (
  runtime: RuntimeLayerData,
  framework: FrameworkLayerData,
  packageManager: PackageManagerLayerData,
): DockerfileData => {
  const copyFiles = [...packageManager.manifests, packageManager.lockfile].join(" ");
  const devInstall = `COPY ${copyFiles} ./\nRUN ${packageManager.devCmd[0]} install`;

  return {
    baseImage: runtime.baseImage,
    devCmd: packageManager.devCmd,
    devCopySource: framework.devCopySource,
    devInstall,
    pmInstall: packageManager.pmInstall,
  };
};

const renderDockerfile = (data: DockerfileData): string =>
  `FROM ${data.baseImage} AS base\n` +
  `WORKDIR /app\n` +
  `\n` +
  `FROM base AS package-manager\n` +
  `${data.pmInstall} \n` +
  `\n` +
  `FROM package-manager AS dev\n` +
  `${data.devInstall}\n` +
  `${data.devCopySource}\n` +
  `CMD ${JSON.stringify(data.devCmd)}\n`;

const defaultLayerRegistry: LayerRegistry = {
  always: alwaysLayer,
  frameworks: frameworksLayer,
  "package-managers": packageManagersLayer,
  runtime: runtimeLayer,
  services: { ...serviceLayer, ...databaseLayer },
};

class LayerCompositionService implements LayerComposer {
  private readonly layers: LayerRegistry;

  constructor(layers: LayerRegistry = defaultLayerRegistry) {
    this.layers = layers;
  }

  resolveLayers(input: CreateSelections): ResolvedLayerSet {
    const resolvedLayers = resolveOrderedLayers(input, this.layers);

    const pmPreinstall =
      input.packageManager === undefined
        ? undefined
        : this.layers["package-managers"][input.packageManager]?.preinstall;

    const composedFiles = composeLayerFiles(resolvedLayers, pmPreinstall);

    const renderer = new LayerTemplateRenderer();
    const frameworkData = this.layers.frameworks?.[input.framework];

    const context: TemplateContext = {
      framework: getLabel("framework", input.framework),
      name: input.name,
      port: frameworkData?.port ?? 0,
      runtime: getLabel("runtime", input.runtime),
    };

    const renderedFiles: Record<string, string> = Object.fromEntries(
      Object.entries(composedFiles).map(([filePath, content]) => [
        filePath,
        renderer.render(content, context),
      ]),
    );

    const runtimeData = this.layers.runtime?.[input.runtime];

    if (
      runtimeData !== undefined &&
      frameworkData !== undefined &&
      input.packageManager !== undefined
    ) {
      const pmData = this.layers["package-managers"][input.packageManager];

      if (pmData !== undefined) {
        renderedFiles["Dockerfile"] = renderDockerfile(
          buildDockerfileData(runtimeData, frameworkData, pmData),
        );
        renderedFiles["docker-compose.dev.yml"] = buildComposeDevYaml(frameworkData, pmData);
        renderedFiles[".devcontainer/docker-compose.yml"] = buildDevcontainerComposeYaml();
        renderedFiles[".devcontainer/devcontainer.json"] = buildDevcontainerJson();
      }
    }

    return {
      files: renderedFiles,
      layers: resolvedLayers,
    };
  }
}

export { defaultLayerRegistry, LayerCompositionService };
export type {
  LayerComposer,
  LayerData,
  LayerRegistry,
  LayerType,
  ResolvedLayer,
  ResolvedLayerSet,
  TemplateContext,
};
