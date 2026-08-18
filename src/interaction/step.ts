import type { CommandResult } from "../output/command-result.js";

interface TextStep {
  type: "text";
  field: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  validate?: (value: string) => string | undefined;
}

interface SelectStep {
  type: "select";
  field: string;
  message: string;
  options: { value: string; label: string }[];
}

interface MultiselectStep {
  type: "multiselect";
  field: string;
  message: string;
  options: { value: string; label: string }[];
  required?: boolean;
}

interface ConfirmStep {
  type: "confirm";
  field: string;
  message: string;
  initialValue?: boolean;
}

interface ProgressStep {
  type: "progress";
  message: string;
}

interface WarningStep {
  type: "warning";
  message: string;
}

interface InfoStep {
  type: "info";
  message: string;
  field?: string;
  data?: Record<string, unknown>;
}

type Step =
  | TextStep
  | SelectStep
  | MultiselectStep
  | ConfirmStep
  | ProgressStep
  | WarningStep
  | InfoStep;

type StepResponse = string | string[] | boolean | undefined;

type CommandGenerator = AsyncGenerator<Step, CommandResult, StepResponse>;

export type {
  Step,
  StepResponse,
  CommandGenerator,
  TextStep,
  SelectStep,
  MultiselectStep,
  ConfirmStep,
  ProgressStep,
  WarningStep,
  InfoStep,
};
