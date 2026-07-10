import type { CreateSelections } from "../prompt/prompt.port.js";
import { buildComposeDevYaml } from "./build-compose-dev-yaml.js";
import { composeLayerFiles } from "./compose-layer-files.js";
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
import type { Labels } from "./schemas/labels.js";
import type {
  FrameworkLayerData,
  PackageManagerLayerData,
  RuntimeLayerData,
} from "./schemas/layers.js";
import type { TemplateProvider } from "./template-provider.js";

interface ResolvedLayerSet {
  files: Record<string, string>;
  layers: ResolvedLayer[];
}

interface LayerComposer {
  resolveLayers(
    input: CreateSelections,
    options?: { forceFetch?: boolean },
  ): Promise<ResolvedLayerSet>;
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

const resolveWithLayers = (
  input: CreateSelections,
  layers: LayerRegistry,
  labels: Labels,
): ResolvedLayerSet => {
  const resolvedLayers = resolveOrderedLayers(input, layers);

  const pmPreinstall =
    input.packageManager === undefined
      ? undefined
      : layers["package-managers"][input.packageManager]?.preinstall;

  const composedFiles = composeLayerFiles(resolvedLayers, pmPreinstall);

  const renderer = new LayerTemplateRenderer();
  const frameworkData = layers.frameworks?.[input.framework];

  const context: TemplateContext = {
    framework: getLabel(labels, "framework", input.framework),
    name: input.name,
    port: frameworkData?.port ?? 0,
    runtime: getLabel(labels, "runtime", input.runtime),
  };

  const renderedFiles: Record<string, string> = Object.fromEntries(
    Object.entries(composedFiles).map(([filePath, content]) => [
      filePath,
      renderer.render(content, context),
    ]),
  );

  const runtimeData = layers.runtime?.[input.runtime];

  if (
    runtimeData !== undefined &&
    frameworkData !== undefined &&
    input.packageManager !== undefined
  ) {
    const pmData = layers["package-managers"][input.packageManager];

    if (pmData !== undefined) {
      renderedFiles["Dockerfile"] = renderDockerfile(
        buildDockerfileData(runtimeData, frameworkData, pmData),
      );
      renderedFiles["docker-compose.dev.yml"] = buildComposeDevYaml(frameworkData, pmData);
    }
  }

  return {
    files: renderedFiles,
    layers: resolvedLayers,
  };
};

class LayerCompositionService implements LayerComposer {
  private readonly provider: TemplateProvider;

  constructor(provider: TemplateProvider) {
    this.provider = provider;
  }

  async resolveLayers(
    input: CreateSelections,
    options?: { forceFetch?: boolean },
  ): Promise<ResolvedLayerSet> {
    const { labels, registry } = await this.provider.loadLayers(options);
    return resolveWithLayers(input, registry, labels);
  }
}

export { LayerCompositionService };
export type {
  LayerComposer,
  LayerData,
  LayerRegistry,
  LayerType,
  ResolvedLayer,
  ResolvedLayerSet,
  TemplateContext,
};
