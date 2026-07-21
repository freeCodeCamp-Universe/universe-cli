import type {
  DatabaseOption,
  PackageManagerOption,
  ServiceOption,
} from "../layer-composition/schemas/layers.js";

interface CreateSelections {
  name: string;
  runtime: string;
  framework: string;
  databases: DatabaseOption[];
  platformServices: ServiceOption[];
  confirmed: boolean;
  packageManager?: PackageManagerOption;
}

interface Prompt {
  promptForCreateInputs(): Promise<CreateSelections | null>;
}

export type { CreateSelections, DatabaseOption, PackageManagerOption, ServiceOption, Prompt };
