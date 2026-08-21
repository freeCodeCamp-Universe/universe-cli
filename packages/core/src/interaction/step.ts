interface ConfirmStep {
  type: "confirm";
  field: string;
  message: string;
  initialValue?: boolean;
}

interface InfoStep {
  type: "info";
  message: string;
  field?: string;
  data?: Record<string, unknown>;
}

interface MultiselectStep {
  type: "multiselect";
  field: string;
  message: string;
  options: { value: string; label: string }[];
  required?: boolean;
}

interface ProgressStep {
  type: "progress";
  message: string;
}

interface SelectStep {
  type: "select";
  field: string;
  message: string;
  options: { value: string; label: string }[];
}

interface TextStep {
  type: "text";
  field: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  validate?: (value: string | undefined) => string | undefined;
}

interface WarningStep {
  type: "warning";
  message: string;
}

type Step =
  | ConfirmStep
  | InfoStep
  | MultiselectStep
  | ProgressStep
  | SelectStep
  | TextStep
  | WarningStep;

type StepResponse = boolean | string | string[] | undefined;
type CommandGenerator = AsyncGenerator<Step, CommandResult, StepResponse>;

export type {
  CommandGenerator,
  ConfirmStep,
  InfoStep,
  MultiselectStep,
  ProgressStep,
  SelectStep,
  Step,
  StepResponse,
  TextStep,
  WarningStep,
};
import type { CommandResult } from "../output/command-result.js";
