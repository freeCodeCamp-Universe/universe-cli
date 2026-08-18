import * as clack from "@clack/prompts";
import { ConfirmError } from "../errors.js";
import { drive } from "./driver.js";
import type { StepHandler } from "./driver.js";
import type { Step, StepResponse } from "./step.js";

function assertNotCancelled<V>(value: V | symbol): asserts value is V {
  if (clack.isCancel(value)) {
    throw new ConfirmError("cancelled");
  }
}

function clackStepHandler(): [StepHandler, () => void] {
  let spin: ReturnType<typeof clack.spinner> | null = null;

  function stopSpinner() {
    if (spin) {
      spin.stop();
      spin = null;
    }
  }

  async function prompt<V>(fn: Promise<V | symbol>): Promise<V> {
    const v = await fn;
    assertNotCancelled(v);
    return v;
  }

  const handle: StepHandler = async (step) => {
    if (step.type !== "progress") {
      stopSpinner();
    }

    switch (step.type) {
      case "text":
        return prompt(
          clack.text({
            message: step.message,
            placeholder: step.placeholder,
            defaultValue: step.default,
            validate: step.validate
              ? (v: string | undefined) => (v !== undefined ? step.validate!(v) : undefined)
              : undefined,
          }),
        );
      case "select":
        return prompt(clack.select({ message: step.message, options: step.options }));
      case "multiselect":
        return prompt(
          clack.multiselect({
            message: step.message,
            options: step.options,
            required: step.required,
          }),
        );
      case "confirm":
        return prompt(clack.confirm({ message: step.message, initialValue: step.default }));
      case "progress":
        if (!spin) {
          spin = clack.spinner();
          spin.start(step.message);
        } else {
          spin.message(step.message);
        }
        return undefined;
      case "warning":
        clack.log.warn(step.message);
        return undefined;
      case "info":
        clack.log.info(step.message);
        return undefined;
    }
  };

  return [handle, stopSpinner];
}

async function clackDriver<T>(
  gen: AsyncGenerator<Step, T, StepResponse>,
): Promise<T> {
  const [handle, cleanup] = clackStepHandler();
  return drive(gen, handle, cleanup);
}

export { clackDriver };
