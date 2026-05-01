import { confirm, isCancel, multiselect, select, text } from "@clack/prompts";
import type {
  CreateSelections,
  DatabaseOption,
  FrameworkOption,
  PackageManagerOption,
  ServiceOption,
  Prompt,
  RuntimeOption,
} from "./prompt.port.js";
import {
  databaseOptions,
  frameworkOptions,
  packageManagerOptions,
  runtimeOptions,
  serviceOptions,
} from "../layer-composition/allowed-configuration.js";
import { getLabel } from "../layer-composition/labels.js";
import type { LabelCategory } from "../layer-composition/labels.js";

interface ClackPromptApi {
  confirm(options: { message: string }): Promise<boolean | symbol>;
  isCancel(value: unknown): value is symbol;
  multiselect(options: {
    message: string;
    options: { label: string; value: string }[];
    required?: boolean;
  }): Promise<string[] | symbol>;
  select(options: {
    message: string;
    options: { label: string; value: string }[];
  }): Promise<string | symbol>;
  text(options: {
    message: string;
    placeholder?: string;
    validate?: (value: string | undefined) => string | Error | undefined;
  }): Promise<string | symbol>;
}

const PROJECT_NAME_PATTERN = /^[a-z][a-z0-9-]{2,49}$/;

const defaultClackApi: ClackPromptApi = {
  confirm,
  isCancel,
  multiselect,
  select,
  text,
};

const toPromptOptions = <T extends string>(
  values: T[],
  category: LabelCategory,
): { label: string; value: T }[] =>
  values.map((value) => ({
    label: getLabel(category, value),
    value,
  }));

const toLabelList = <T extends string>(values: T[], category: LabelCategory): string =>
  values.map((value) => getLabel(category, value)).join(", ");

class ClackPrompt implements Prompt {
  private readonly api: ClackPromptApi;

  constructor(api: ClackPromptApi = defaultClackApi) {
    this.api = api;
  }

  async promptForCreateInputs(): Promise<CreateSelections | null> {
    const name = await this.api.text({
      message: "Enter project name",
      placeholder: "my-project",
      validate: (value) => {
        if (value !== undefined && PROJECT_NAME_PATTERN.test(value)) {
          return undefined;
        }

        return "Name must be lowercase kebab-case, start with a letter, and be 3–50 characters long.";
      },
    });

    if (this.api.isCancel(name)) {
      return null;
    }

    const runtime = await this.api.select({
      message: "Select runtime",
      options: toPromptOptions(runtimeOptions(), "runtime"),
    });

    if (this.api.isCancel(runtime)) {
      return null;
    }

    const framework = await this.api.select({
      message: "Select framework",
      options: toPromptOptions(frameworkOptions(runtime as RuntimeOption), "framework"),
    });

    if (this.api.isCancel(framework)) {
      return null;
    }

    let packageManager: string | symbol | undefined;
    const packageManagers = packageManagerOptions(runtime as RuntimeOption);
    if (packageManagers.length === 1) {
      const [autoSelected] = packageManagers;
      if (autoSelected !== undefined) {
        packageManager = autoSelected;
      }
    } else if (packageManagers.length > 1) {
      packageManager = await this.api.select({
        message: "Select package manager",
        options: toPromptOptions(packageManagers as PackageManagerOption[], "packageManager"),
      });

      if (this.api.isCancel(packageManager)) {
        return null;
      }
    }

    const availableDatabases = databaseOptions(runtime as RuntimeOption);

    let databases: string[] | symbol = [];
    if (availableDatabases.length > 0) {
      databases = await this.api.multiselect({
        message: "Select databases",
        options: toPromptOptions(availableDatabases, "database"),
        required: false,
      });
    }

    if (this.api.isCancel(databases)) {
      return null;
    }

    const platformServices = await this.api.multiselect({
      message: "Select platform services",
      options: toPromptOptions(serviceOptions(runtime as RuntimeOption), "service"),
      required: false,
    });

    if (this.api.isCancel(platformServices)) {
      return null;
    }

    const confirmLines = [
      "Confirm create configuration:",
      `- Name: ${name}`,
      `- Runtime: ${getLabel("runtime", runtime as RuntimeOption)}`,
      `- Framework: ${getLabel("framework", framework as FrameworkOption)}`,
    ];

    if (packageManager !== undefined) {
      confirmLines.push(
        `- Package manager: ${getLabel("packageManager", packageManager as PackageManagerOption)}`,
      );
    }

    confirmLines.push(
      `- Databases: ${toLabelList(databases as DatabaseOption[], "database")}`,
      `- Platform services: ${toLabelList(platformServices as ServiceOption[], "service")}`,
    );

    const isConfirmed = await this.api.confirm({
      message: confirmLines.join("\n"),
    });

    if (this.api.isCancel(isConfirmed)) {
      return null;
    }

    return {
      confirmed: isConfirmed,
      databases: databases as DatabaseOption[],
      framework: framework as FrameworkOption,
      name,
      platformServices: platformServices as ServiceOption[],
      runtime: runtime as RuntimeOption,
      ...(packageManager !== undefined && {
        packageManager: packageManager as PackageManagerOption,
      }),
    };
  }
}

export { ClackPrompt };
export type { ClackPromptApi };
