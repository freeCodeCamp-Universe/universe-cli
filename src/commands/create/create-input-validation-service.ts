import { UsageError } from "../../errors.js";
import {
  databaseOptions,
  frameworkOptions,
  packageManagerOptions,
  serviceOptions,
} from "./layer-composition/allowed-configuration.js";
import type { RuntimeCombinations } from "./layer-composition/allowed-configuration.js";
import type { Runtime } from "./layer-composition/schemas/layers.js";
import { RUNTIME_OPTIONS } from "./layer-composition/schemas/layers.js";
import type { CreateSelections } from "./prompt/prompt.port.js";

type PathExists = (path: string) => boolean;

const PROJECT_NAME_PATTERN = /^[a-z][a-z0-9-]{2,49}$/;
const NONE_VALUE = "none";

interface CreateInputValidator {
  validateCreateInput(input: CreateSelections): CreateSelections;
}

class CreateInputValidationService implements CreateInputValidator {
  private readonly pathExists: PathExists;
  private readonly runtimeData: Runtime;

  constructor(pathExists: PathExists, runtimeData: Runtime) {
    this.pathExists = pathExists;
    this.runtimeData = runtimeData;
  }

  validateCreateInput(input: CreateSelections): CreateSelections {
    this.validateName(input.name);

    if (this.pathExists(input.name)) {
      throw new UsageError(`directory "${input.name}" already exists`);
    }

    this.validateRuntimeAndCombinations(input);

    return input;
  }

  private validateName(name: string): void {
    if (PROJECT_NAME_PATTERN.test(name)) {
      return;
    }

    throw new UsageError(
      `invalid project name "${name}": use 3–50 lowercase letters, digits, or hyphens, starting with a letter`,
    );
  }

  private validateRuntimeAndCombinations(input: CreateSelections): void {
    const isValidRuntime = Object.values(RUNTIME_OPTIONS).includes(input.runtime);

    if (!isValidRuntime) {
      throw new UsageError(`unsupported runtime "${input.runtime}"`);
    }

    const config: RuntimeCombinations = {
      databases: databaseOptions(this.runtimeData, input.runtime),
      frameworks: frameworkOptions(this.runtimeData, input.runtime),
      packageManagers: packageManagerOptions(this.runtimeData, input.runtime),
      platformServices: serviceOptions(this.runtimeData, input.runtime),
    };

    this.validateRuntimeSelections(input, config);
  }

  private validateRuntimeSelections(input: CreateSelections, config: RuntimeCombinations): void {
    if (!config.frameworks.includes(input.framework)) {
      throw new UsageError(
        `unsupported framework "${input.framework}" for runtime "${input.runtime}"`,
      );
    }

    if (config.packageManagers.length > 0) {
      if (
        input.packageManager === undefined ||
        !config.packageManagers.includes(input.packageManager)
      ) {
        throw new UsageError(
          `Runtime requires a supported package manager (${config.packageManagers.join(", ")})`,
        );
      }
    } else if (input.packageManager !== undefined) {
      throw new UsageError(
        "This runtime does not support a package manager",
      );
    }

    this.ensureNoneExclusive("databases", input.databases);
    this.ensureNoneExclusive("platform services", input.platformServices);

    this.ensureAllowedValues(input.databases, config.databases, "databases");
    this.ensureAllowedValues(input.platformServices, config.platformServices, "platform services");
  }

  private ensureNoneExclusive(field: string, values: string[]): void {
    if (!values.includes(NONE_VALUE)) {
      return;
    }

    if (values.length > 1) {
      throw new UsageError(`"none" is exclusive: remove other ${field} selections`);
    }
  }

  private ensureAllowedValues(values: string[], allowedValues: string[], field: string): void {
    for (const value of values) {
      if (!allowedValues.includes(value)) {
        throw new UsageError(`Unsupported ${field} value: ${value}`);
      }
    }
  }
}

export { CreateInputValidationService };
export type { PathExists, CreateInputValidator };
