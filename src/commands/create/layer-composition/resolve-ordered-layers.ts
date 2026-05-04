import { MissingLayerError } from "../../../errors/cli-errors.js";
import type { CreateSelections } from "../prompt/prompt.port.js";
import type {
  FrameworkLayerData,
  PackageManagerLayerData,
  RuntimeLayerData,
} from "./schemas/layers.js";

type LayerType = "always" | "frameworks" | "package-managers" | "runtime" | "services";

interface LayerData {
  files: Record<string, string>;
}

interface LayerRegistry {
  always: Record<string, LayerData>;
  frameworks: Record<string, FrameworkLayerData>;
  "package-managers": Record<string, PackageManagerLayerData>;
  runtime: Record<string, RuntimeLayerData>;
  services: Record<string, LayerData>;
}

interface ResolvedLayer {
  files: Record<string, string>;
  layerType: LayerType;
  name: string;
}

const resolveOrderedLayers = (input: CreateSelections, layers: LayerRegistry): ResolvedLayer[] => {
  const isNode = input.runtime === "node";
  const runtimeId = isNode ? "node" : "static_web";

  const refs: { id: string; layerType: LayerType }[] = [
    { id: "always", layerType: "always" },
    { id: runtimeId, layerType: "runtime" },
    ...(input.packageManager === undefined
      ? []
      : [{ id: input.packageManager, layerType: "package-managers" as const }]),
    { id: input.framework, layerType: "frameworks" },
    ...[...input.databases, ...input.platformServices].map((id) => ({
      id,
      layerType: "services" as const,
    })),
  ];

  return refs.map(({ id, layerType }) => {
    const layer = layers[layerType]?.[id];
    const name = layerType === "always" ? id : `${layerType}/${id}`;

    if (layer === undefined) {
      throw new MissingLayerError(name);
    }

    return { files: layer.files, layerType, name };
  });
};

export { resolveOrderedLayers };
export type { LayerData, LayerRegistry, LayerType, ResolvedLayer };
