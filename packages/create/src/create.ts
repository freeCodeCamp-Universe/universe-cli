import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Step, StepResponse } from "@freecodecamp/universe-core";
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
import type { CreateSelections } from "./types.js";
import type { DonationConfigWriter } from "./io/donation-config-writer.port.js";
import { LocalDonationConfigWriter } from "./io/local-donation-config-writer.js";
import type { RepoInitialiser } from "./io/repo-initialiser.port.js";
import { GitRepoInitialiser } from "./io/git-repo-initialiser.js";
import type { SkillInstaller } from "./io/skill-installer.port.js";
import { NpxSkillInstaller } from "./io/npx-skill-installer.js";
import {
  CreateInputValidationService,
  type CreateInputValidator,
} from "./create-input-validation-service.js";
import {
  databaseOptions,
  recommendedFrameworkOptions,
  recommendedPackageManagerOptions,
  recommendedRuntimeOptions,
  serviceOptions,
} from "./layer-composition/allowed-configuration.js";
import type {
  DatabaseOption,
  PackageManagerOption,
  ServiceOption,
} from "./layer-composition/schemas/layers.js";
import { getLabel } from "./layer-composition/labels.js";
import type { LabelCategory } from "./layer-composition/labels.js";
import { UsageError } from "@freecodecamp/universe-core";
import type { CommandResult } from "@freecodecamp/universe-core";
import { buildEnvelope } from "@freecodecamp/universe-core";
import { LocalProjectWriter } from "./io/local-project-writer.js";
import { loadFromDir, type TemplateData } from "./layer-composition/template-provider.js";
import { bsd3ClauseLicense } from "./layer-composition/licenses/bsd-3-clause.js";
import { templateVersionRange } from "./layer-composition/assets.js";
import { ensureTemplateDir } from "./layer-composition/template-fetcher.js";
import { resolveTemplateVersions, formatTemplateNotice } from "./template-version-check.js";
import { isDisabled } from "@freecodecamp/universe-core";
import { isDockerAvailable } from "./docker-check.js";

const PROJECT_NAME_PATTERN = /^[a-z][a-z0-9-]{2,49}$/;
const defaultFilesystemWriter: ProjectWriter = new LocalProjectWriter();

export interface CreateOptions {
  forceFetch?: boolean;
  name?: string;
  runtime?: string;
  framework?: string;
  databases?: string[];
  services?: string[];
  packageManager?: string;
  yes?: boolean;
}

export interface CreateDeps {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  donationConfigWriter?: DonationConfigWriter;
  filesystemWriter?: ProjectWriter;
  layerResolver?: LayerComposer;
  packageManager?: PackageManager;
  platformManifestGenerator?: PlatformManifestGenerator;
  repoInitialiser?: RepoInitialiser;
  skillInstaller?: SkillInstaller;
  loadLayersFn?: (dir: string) => Promise<TemplateData>;
  validator?: CreateInputValidator;
}

function toOptions<T extends string>(
  values: T[],
  labels: Parameters<typeof getLabel>[0],
  category: LabelCategory,
): { value: T; label: string }[] {
  return values.map((value) => ({
    value,
    label: getLabel(labels, category, value),
  }));
}

/** Scaffold a new Constellation project. Yields select/multiselect/text/progress steps. */
async function* create(
  options: CreateOptions,
  deps: CreateDeps = {},
): AsyncGenerator<Step, CommandResult, StepResponse> {
  const cwd = deps.cwd ?? process.cwd();
  const env = deps.env ?? process.env;
  const filesystemWriter = deps.filesystemWriter ?? defaultFilesystemWriter;
  const packageManager =
    deps.packageManager ??
    new PackageManagerService({
      pnpm: new PnpmPackageManager(),
      bun: new BunPackageManager(),
    });
  const platformManifestGenerator = deps.platformManifestGenerator ?? new PlatformManifestService();
  const donationConfigWriter = deps.donationConfigWriter ?? new LocalDonationConfigWriter();
  const repoInitialiser = deps.repoInitialiser ?? new GitRepoInitialiser();
  const skillInstaller = deps.skillInstaller ?? new NpxSkillInstaller();

  async function findTemplateVersion(range: string) {
    const { latest, latestCompatible } = await resolveTemplateVersions(range);
    if (!isDisabled() && latestCompatible !== latest) {
      templateVersionWarning = formatTemplateNotice({ current: latestCompatible, latest }, false);
    }
    return latestCompatible;
  }

  async function findTemplateConfig(envVersion?: string, envDir?: string) {
    if (envDir && envDir.length > 0) return { templateDir: envDir, templateVersion: null };
    const version =
      envVersion && envVersion.length > 0
        ? envVersion
        : await findTemplateVersion(templateVersionRange);
    return {
      templateDir: await ensureTemplateDir(version, { forceFetch: options.forceFetch }),
      templateVersion: version,
    };
  }

  let templateVersionWarning: string | undefined;
  const envDir = env["UNIVERSE_TEMPLATES_DIR"];
  const envVersion = env["UNIVERSE_TEMPLATES_VERSION"];
  const { templateDir, templateVersion } = await findTemplateConfig(envVersion, envDir);
  if (templateVersionWarning) {
    yield { type: "warning", message: templateVersionWarning };
  }

  const loadLayersFn = deps.loadLayersFn ?? loadFromDir;
  const { labels, registry } = await loadLayersFn(templateDir);

  const layerResolver = deps.layerResolver ?? new LayerCompositionService(labels, registry);
  const toTarget = (path: string) => join(cwd, path)
  const validator =
    deps.validator ??
    new CreateInputValidationService((path) => existsSync(toTarget(path)), registry.runtime);

  let selections: CreateSelections;

  if (!isDockerAvailable()) {
    yield {
      type: "warning",
      message:
        "docker is the preferred tool for scaffolding projects.\nLocal alternatives will be used where possible, but docker should be used for predictable results.",
    };
  }

  if (!options.yes) {
    // Interactive: yield prompts for missing values
    const name = (yield {
      type: "text",
      field: "name",
      message: "Enter project name",
      placeholder: "my-project",
      validate: (value: string | undefined) =>
        value !== undefined && PROJECT_NAME_PATTERN.test(value)
          ? undefined
          : "Name must be lowercase kebab-case, start with a letter, and be 3–50 characters long.",
    }) as string;

    const runtimes = recommendedRuntimeOptions(registry.runtime);
    if (runtimes.length === 0) {
      throw new UsageError("No recommended runtimes available — update your templates.");
    }
    let runtime: string;
    if (runtimes.length === 1) {
      runtime = runtimes[0];
    } else {
      runtime = (yield {
        type: "select",
        field: "runtime",
        message: "Select runtime",
        options: toOptions(runtimes, labels, "runtime"),
      }) as string;
    }

    const frameworks = recommendedFrameworkOptions(registry.runtime, runtime, registry.frameworks);
    if (frameworks.length === 0) {
      throw new UsageError(
        `No recommended frameworks for runtime "${runtime}" — update your templates.`,
      );
    }
    let framework: string;
    if (frameworks.length === 1) {
      framework = frameworks[0];
    } else {
      framework = (yield {
        type: "select",
        field: "framework",
        message: "Select framework",
        options: toOptions(frameworks, labels, "framework"),
      }) as string;
    }

    const recPMs = recommendedPackageManagerOptions(
      registry.runtime,
      runtime,
      registry["package-managers"],
    );
    if (recPMs.length === 0) {
      throw new UsageError(
        `No recommended package managers for runtime "${runtime}" — update your templates.`,
      );
    }
    let pm: PackageManagerOption | undefined;
    if (recPMs.length === 1) {
      pm = recPMs[0] as PackageManagerOption;
    } else {
      pm = (yield {
        type: "select",
        field: "packageManager",
        message: "Select package manager",
        options: toOptions(recPMs as PackageManagerOption[], labels, "packageManager"),
      }) as PackageManagerOption;
    }

    const availableDatabases = databaseOptions(registry.runtime, runtime);
    let databases: DatabaseOption[] = [];
    if (availableDatabases.length > 0) {
      databases = (yield {
        type: "multiselect",
        field: "databases",
        message: "Select 0 or more databases (space to select, enter to continue)",
        options: toOptions(availableDatabases, labels, "database"),
        required: false,
      }) as string[] as DatabaseOption[];
    }

    const availableServices = serviceOptions(registry.runtime, runtime);
    let platformServices: ServiceOption[] = [];
    if (availableServices.length > 0) {
      platformServices = (yield {
        type: "multiselect",
        field: "services",
        message: "Select 0 or more platform services (space to select, enter to continue)",
        options: toOptions(availableServices, labels, "service"),
        required: false,
      }) as string[] as ServiceOption[];
    }

    // Summary info step
    const summaryLines = [
      `Creating project with:`,
      `- Name: ${name}`,
      `- Runtime: ${getLabel(labels, "runtime", runtime)}`,
      `- Framework: ${getLabel(labels, "framework", framework)}`,
    ];
    if (pm !== undefined) {
      summaryLines.push(`- Package manager: ${getLabel(labels, "packageManager", pm)}`);
    }
    if (databases.length > 0) {
      summaryLines.push(
        `- Databases: ${databases.map((d) => getLabel(labels, "database", d)).join(", ")}`,
      );
    }
    if (platformServices.length > 0) {
      summaryLines.push(
        `- Platform services: ${platformServices.map((s) => getLabel(labels, "service", s)).join(", ")}`,
      );
    }
    if (templateVersion) {
      summaryLines.push(`- Templates version: ${templateVersion}`);
    }
    yield { type: "info", message: summaryLines.join("\n") };

    selections = {
      name,
      runtime,
      framework,
      databases,
      platformServices,
      ...(pm !== undefined ? { packageManager: pm } : {}),
    };
  } else {
    // Non-interactive: use provided options or defaults
    if (!options.name) {
      throw new UsageError("--name is required in non-interactive mode");
    }

    const recRuntimes = recommendedRuntimeOptions(registry.runtime);
    const runtime = options.runtime ?? recRuntimes[0];
    if (runtime === undefined) {
      throw new UsageError(
        "No recommended runtimes — specify --runtime explicitly or update templates.",
      );
    }

    const recFrameworks = recommendedFrameworkOptions(
      registry.runtime,
      runtime,
      registry.frameworks,
    );
    const framework = options.framework ?? recFrameworks[0];
    if (framework === undefined) {
      throw new UsageError(
        `No recommended frameworks for runtime "${runtime}" — specify --framework explicitly or update templates.`,
      );
    }

    const recPMs = recommendedPackageManagerOptions(
      registry.runtime,
      runtime,
      registry["package-managers"],
    );
    const pm =
      options.packageManager !== undefined
        ? (options.packageManager as PackageManagerOption)
        : recPMs.length > 0
          ? (recPMs[0] as PackageManagerOption)
          : undefined;
    if (pm === undefined) {
      throw new UsageError(
        `No recommended package managers for runtime "${runtime}" — specify --packageManager explicitly or update templates.`,
      );
    }

    selections = {
      name: options.name,
      runtime,
      framework,
      databases: (options.databases ?? []) as DatabaseOption[],
      platformServices: (options.services ?? []) as ServiceOption[],
      ...(pm !== undefined ? { packageManager: pm } : {}),
    };
  }

  yield { type: "progress", message: "Preparing your project" };

  const validatedInput = validator.validateCreateInput(selections);

  yield { type: "progress", message: "Composing project layers" };
  const resolvedLayers = layerResolver.resolveLayers(validatedInput);
  const targetDirectory = toTarget(validatedInput.name);

  yield { type: "progress", message: "Writing project files" };
  await filesystemWriter.writeProject(targetDirectory, resolvedLayers.files);

  if (Object.keys(resolvedLayers.symlinks).length > 0) {
    yield { type: "progress", message: "Creating symlinks" };
    await filesystemWriter.createSymlinks(targetDirectory, resolvedLayers.symlinks);
  }

  yield { type: "progress", message: "Writing platform manifest" };
  await filesystemWriter.writeProject(targetDirectory, {
    "platform.yaml": platformManifestGenerator.generatePlatformManifest(validatedInput),
  });

  yield { type: "progress", message: "Adding LICENSE" };
  await filesystemWriter.writeProject(targetDirectory, {
    LICENSE: bsd3ClauseLicense,
  });

  const manager = validatedInput.packageManager;
  if (manager !== undefined) {
    yield { type: "progress", message: `Pinning dependencies with ${manager}` };
    await packageManager.specifyDeps({
      manager,
      pmVersion: registry["package-managers"][manager]?.pmVersion ?? "",
      projectDirectory: targetDirectory,
    });
  }

  const skills = registry.frameworks[validatedInput.framework]?.skills;
  if (skills && skills.length > 0) {
    yield { type: "progress", message: "Installing skills" };
    try {
      await skillInstaller.installSkills(skills, targetDirectory);
    } catch (err) {
      yield { type: "warning", message: err instanceof Error ? err.message : String(err) };
    }
  }

  yield { type: "progress", message: "Writing donation config" };
  await donationConfigWriter.write(targetDirectory);

  yield { type: "progress", message: "Initialising git repository" };
  await repoInitialiser.initialise(targetDirectory);

  if (!isDockerAvailable()) {
    yield {
      type: "warning",
      message:
        "docker daemon unavailable. Either restart the daemon or, if you aren't using docker, check the new project for a dev script",
    };
    yield {
      type: "info",
      message:
        "Once the daemon is available, `docker compose up --watch` will start the project. Otherwise check the project for a dev script.",
    };
  }

  const format = `cd into ${validatedInput.name} and run \`docker compose up --watch\` to start the project`;

  return {
    data: buildEnvelope("create", true, {
      path: targetDirectory,
      name: validatedInput.name,
      runtime: validatedInput.runtime,
      framework: validatedInput.framework,
      databases: validatedInput.databases,
      platformServices: validatedInput.platformServices,
      packageManager: validatedInput.packageManager ?? null,
      templateVersion,
    }),
    format,
  };
}

export { create };
