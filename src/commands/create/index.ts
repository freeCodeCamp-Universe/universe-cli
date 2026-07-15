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
import type { CreateSelections, Prompt } from "./prompt/prompt.port.js";
import { ClackPrompt } from "./prompt/clack-prompt.js";
import type { RepoInitialiser } from "./io/repo-initialiser.port.js";
import { GitRepoInitialiser } from "./io/git-repo-initialiser.js";
import {
  CreateInputValidationService,
  type CreateInputValidator,
} from "./create-input-validation-service.js";
import {
  runtimeOptions,
  frameworkOptions,
  packageManagerOptions,
} from "./layer-composition/allowed-configuration.js";
import type {
  DatabaseOption,
  PackageManagerOption,
  ServiceOption,
} from "./layer-composition/schemas/layers.js";
import { clackLogger, silentLogger, type Logger } from "../../output/logger.js";
import { EXIT_USAGE, exitWithCode } from "../../output/exit-codes.js";
import { CliError, ConfirmError, UsageError } from "../../errors.js";
import { buildEnvelope } from "../../output/envelope.js";
import { emitJson, outputError } from "../../output/format.js";
import { LocalProjectWriter } from "./io/local-project-writer.js";
import {
  RemoteTemplateProvider,
  type TemplateProvider,
} from "./layer-composition/template-provider.js";
import { defaultTemplateVersion } from "./layer-composition/assets.js";
import {
  checkTemplateVersion,
  formatTemplateNotice,
} from "../../lib/template-version-check.js";

export interface HandlerResult {
  exitCode: number;
  meta?: Record<string, string>;
}

const defaultFilesystemWriter: ProjectWriter = new LocalProjectWriter();

export interface CreateOptions {
  json: boolean;
  forceFetch?: boolean;
  yes?: boolean;
  name?: string;
  runtime?: string;
  framework?: string;
  databases?: string[];
  services?: string[];
  packageManager?: string;
}

export interface CreateDeps {
  cwd?: string;
  exit?: (code: number) => void;
  filesystemWriter?: ProjectWriter;
  isTTY?: boolean;
  layerResolver?: LayerComposer;
  logger?: Logger;
  packageManager?: PackageManager;
  platformManifestGenerator?: PlatformManifestGenerator;
  prompt?: Prompt;
  repoInitialiser?: RepoInitialiser;
  templateProvider?: TemplateProvider;
  validator?: CreateInputValidator;
}

export const create = async (
  options: CreateOptions,
  deps: CreateDeps = {},
): Promise<void> => {
  const cwd = deps.cwd ?? process.cwd();
  const exit = deps.exit ?? exitWithCode;
  const filesystemWriter = deps.filesystemWriter ?? defaultFilesystemWriter;
  const logger = deps.logger ?? (options.json ? silentLogger : clackLogger);
  const packageManager =
    deps.packageManager ??
    new PackageManagerService({
      pnpm: new PnpmPackageManager(),
      bun: new BunPackageManager(),
    });
  const platformManifestGenerator =
    deps.platformManifestGenerator ?? new PlatformManifestService();
  const repoInitialiser = deps.repoInitialiser ?? new GitRepoInitialiser();

  try {
    const templatesDir = process.env["UNIVERSE_TEMPLATES_DIR"];
    if (!(templatesDir && templatesDir.length > 0)) {
      const envVersion = process.env["UNIVERSE_TEMPLATES_VERSION"];
      const effectiveVersion =
        envVersion && envVersion.length > 0 ? envVersion : defaultTemplateVersion;
      try {
        const notice = await checkTemplateVersion(effectiveVersion);
        if (notice) {
          process.stderr.write(formatTemplateNotice(notice));
        }
      } catch {
        // Non-fatal: never block scaffolding.
      }
    }

    const templateProvider = deps.templateProvider ?? new RemoteTemplateProvider();
    const { labels, registry } = await templateProvider.loadLayers({
      forceFetch: options.forceFetch,
    });

    const isTTY = deps.isTTY ?? Boolean(process.stdin.isTTY);
    const interactive = isTTY && !options.yes && !options.json;

    const prompt =
      deps.prompt ?? new ClackPrompt(registry.runtime, labels);
    const layerResolver =
      deps.layerResolver ?? new LayerCompositionService(templateProvider);
    const validator =
      deps.validator ??
      new CreateInputValidationService(
        (path) => existsSync(path),
        registry.runtime,
      );

    let selections: CreateSelections;

    if (interactive) {
      const promptResult = await prompt.promptForCreateInputs();

      if (promptResult === null || !promptResult.confirmed) {
        logger.warn("Create cancelled before writing files.");
        throw new ConfirmError("Create cancelled before writing files.");
      }

      selections = promptResult;
    } else {
      if (!options.name) {
        throw new UsageError("--name is required in non-interactive mode");
      }

      const runtimes = runtimeOptions(registry.runtime);
      const runtime = options.runtime ?? runtimes[0];
      const frameworks = frameworkOptions(registry.runtime, runtime);
      const framework = options.framework ?? frameworks[0];
      const pkgManagers = packageManagerOptions(registry.runtime, runtime);
      const pm =
        options.packageManager !== undefined
          ? (options.packageManager as PackageManagerOption)
          : pkgManagers.length === 1
            ? (pkgManagers[0] as PackageManagerOption)
            : undefined;

      selections = {
        name: options.name,
        runtime,
        framework,
        databases: (options.databases ?? []) as DatabaseOption[],
        platformServices: (options.services ?? []) as ServiceOption[],
        confirmed: true,
        ...(pm !== undefined ? { packageManager: pm } : {}),
      };
    }

    const validatedInput = validator.validateCreateInput(selections);
    const resolvedLayers = await layerResolver.resolveLayers(validatedInput);
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

    if (options.json) {
      emitJson(
        buildEnvelope("create", true, {
          path: targetDirectory,
          name: validatedInput.name,
          runtime: validatedInput.runtime,
          framework: validatedInput.framework,
          databases: validatedInput.databases,
          platformServices: validatedInput.platformServices,
          packageManager: validatedInput.packageManager ?? null,
        }),
      );
      return;
    }

    if (interactive) {
      logger.success(`Scaffolded project at ${targetDirectory}`);
    } else {
      logger.info(`Scaffolded project '${validatedInput.name}' at ${targetDirectory}`);
    }
  } catch (err) {
    const code = err instanceof CliError ? err.exitCode : EXIT_USAGE;
    const message = err instanceof Error ? err.message : String(err);
    outputError({ json: options.json, command: "create" }, code, message, {
      logError: logger.error,
    });
    exit(code);
  }
};
