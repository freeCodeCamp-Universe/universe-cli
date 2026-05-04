import type {
  DatabaseOption,
  FrameworkOption,
  PackageManagerOption,
  RuntimeOption,
  ServiceOption,
} from "../layer-composition/schemas/layers.js";

interface CreateSelections {
  name: string;
  runtime: RuntimeOption;
  framework: FrameworkOption;
  databases: DatabaseOption[];
  platformServices: ServiceOption[];
  confirmed: boolean;
  packageManager?: PackageManagerOption;
}

interface Prompt {
  promptForCreateInputs(): Promise<CreateSelections | null>;
}

export type {
  CreateSelections,
  DatabaseOption,
  FrameworkOption,
  PackageManagerOption,
  ServiceOption,
  Prompt,
  RuntimeOption,
};
