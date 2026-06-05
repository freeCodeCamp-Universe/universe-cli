import { existsSync } from "node:fs";
import type { ProjectWriter } from "./io/project-writer.port.js";
import {
  LayerCompositionService,
  type LayerComposer,
} from "./layer-composition/layer-composition-service.js";
import {
  PackageManagerService,
  type PackageManager,
} from "./package-manager/package-manager.service.js";
import { BunPackageManager } from "./package-manager/bun-package-manager.js";
import { PnpmPackageManager } from "./package-manager/pnpm-package-manager.js";
import {
  PlatformManifestService,
  type PlatformManifestGenerator,
} from "./platform-manifest-service.js";
import type { Prompt } from "./prompt/prompt.port.js";
import { ClackPrompt } from "./prompt/clack-prompt.js";
import type { RepoInitialiser } from "./io/repo-initialiser.port.js";
import { GitRepoInitialiser } from "./io/git-repo-initialiser.js";
import {
  CreateInputValidationService,
  type CreateInputValidator,
} from "./create-input-validation-service.js";
import { clackLogger, type Logger } from "../../output/logger.js";
import { EXIT_USAGE, exitWithCode } from "../../output/exit-codes.js";
import { CliError, ConfirmError } from "../../errors.js";
import { outputError } from "../../output/format.js";
import { LocalProjectWriter } from "./io/local-project-writer.js";

export interface HandlerResult {
  exitCode: number;
  meta?: Record<string, string>;
}

const defaultFilesystemWriter: ProjectWriter = new LocalProjectWriter();

export interface CreateDeps {
  cwd?: string;
  exit?: (code: number) => void;
  filesystemWriter?: ProjectWriter;
  layerResolver?: LayerComposer;
  logger?: Logger;
  packageManager?: PackageManager;
  platformManifestGenerator?: PlatformManifestGenerator;
  prompt?: Prompt;
  repoInitialiser?: RepoInitialiser;
  validator?: CreateInputValidator;
}

export const create = async (
  options: { json: boolean },
  deps: CreateDeps = {},
): Promise<void> => {
  const cwd = deps.cwd ?? process.cwd();
  const exit = deps.exit ?? exitWithCode;
  const filesystemWriter = deps.filesystemWriter ?? defaultFilesystemWriter;
  const layerResolver = deps.layerResolver ?? new LayerCompositionService();
  const logger = deps.logger ?? clackLogger;
  const packageManager =
    deps.packageManager ??
    new PackageManagerService({
      pnpm: new PnpmPackageManager(),
      bun: new BunPackageManager(),
    });
  const platformManifestGenerator =
    deps.platformManifestGenerator ?? new PlatformManifestService();
  const prompt = deps.prompt ?? new ClackPrompt();
  const repoInitialiser = deps.repoInitialiser ?? new GitRepoInitialiser();
  const validator =
    deps.validator ?? new CreateInputValidationService(existsSync);

  try {
    const promptResult = await prompt.promptForCreateInputs();

    if (promptResult === null || !promptResult.confirmed) {
      logger.warn("Create cancelled before writing files.");
      throw new ConfirmError("Create cancelled before writing files.");
    }

    const validatedInput = validator.validateCreateInput(promptResult);
    const resolvedLayers = layerResolver.resolveLayers(validatedInput);
    const targetDirectory = `${cwd}/${validatedInput.name}`;
    const projectFiles = {
      ...resolvedLayers.files,
      "platform.yaml":
        platformManifestGenerator.generatePlatformManifest(validatedInput),
    };

    await filesystemWriter.writeProject(targetDirectory, projectFiles);

    const manager = validatedInput.packageManager;

    if (manager !== undefined) {
      await packageManager.specifyDeps({
        manager,
        projectDirectory: targetDirectory,
      });
    }

    await repoInitialiser.initialise(targetDirectory);

    logger.success(`Scaffolded project at ${targetDirectory}`);
  } catch (err) {
    const code = err instanceof CliError ? err.exitCode : EXIT_USAGE;
    const message = err instanceof Error ? err.message : String(err);
    outputError({ json: options.json, command: "create" }, code, message, {
      logError: logger.error,
    });
    exit(code);
  }
};
