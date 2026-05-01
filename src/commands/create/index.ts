import type { FilesystemWriter } from "../../io/filesystem-writer.port.js";
import type { LayerComposer } from "./layer-composition/layer-composition-service.js";
import type { PackageManager } from "./package-manager/package-manager.service.js";
import type { PlatformManifestGenerator } from "../../services/platform-manifest-service.js";
import type { Prompt } from "./prompt/prompt.port.js";
import type { RepoInitialiser } from "../../io/repo-initialiser.port.js";
import type { CreateInputValidator } from "./create-input-validation-service.js";
import type { Logger } from "../../output/logger.js";

export interface HandlerResult {
  exitCode: number;
  meta?: Record<string, string>;
}

export const handleCreate = async (
  { cwd }: { cwd: string },
  deps: {
    filesystemWriter: FilesystemWriter;
    layerResolver: LayerComposer;
    logger: Logger;
    packageManager: PackageManager;
    platformManifestGenerator: PlatformManifestGenerator;
    prompt: Prompt;
    repoInitialiser: RepoInitialiser;
    validator: CreateInputValidator;
  },
): Promise<HandlerResult> => {
  const { logger } = deps;
  const promptResult = await deps.prompt.promptForCreateInputs();

  if (promptResult === null || !promptResult.confirmed) {
    logger.warn("Create cancelled before writing files.");
    return { exitCode: 1 };
  }

  const validatedInput = deps.validator.validateCreateInput(promptResult);
  const resolvedLayers = deps.layerResolver.resolveLayers(validatedInput);
  const targetDirectory = `${cwd}/${validatedInput.name}`;
  const projectFiles = {
    ...resolvedLayers.files,
    "platform.yaml": deps.platformManifestGenerator.generatePlatformManifest(validatedInput),
  };

  await deps.filesystemWriter.writeProject(targetDirectory, projectFiles);

  const manager = validatedInput.packageManager;

  if (manager !== undefined) {
    await deps.packageManager.specifyDeps({
      manager,
      projectDirectory: targetDirectory,
    });
  }

  await deps.repoInitialiser.initialise(targetDirectory);

  logger.success(`Scaffolded project at ${targetDirectory}`);
  return { exitCode: 0 };
};
