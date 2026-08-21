import * as clack from "@clack/prompts";
import { ConfirmError } from "../errors.js";
import { drive } from "./driver.js";
import type { StepHandler } from "./driver.js";
import type { Step, StepResponse } from "./step.js";

function assertNotCancelled<Value>(value: Value | symbol): asserts value is Value {
  if (clack.isCancel(value)) {
    throw new ConfirmError("cancelled");
  }
}

function clackStepHandler(): [StepHandler, () => void] {
  let activeSpinner: ReturnType<typeof clack.spinner> | null = null;

  function stopSpinner(): void {
    activeSpinner?.stop();
    activeSpinner = null;
  }

  async function prompt<Value>(request: Promise<Value | symbol>): Promise<Value> {
    const value = await request;
    assertNotCancelled(value);
    return value;
  }

  const handle: StepHandler = async (step) => {
    if (step.type !== "progress") stopSpinner();

    switch (step.type) {
      case "confirm":
        return prompt(clack.confirm(step));
      case "info":
        clack.log.info(step.message);
        return undefined;
      case "multiselect":
        return prompt(clack.multiselect(step));
      case "progress":
        if (activeSpinner === null) {
          activeSpinner = clack.spinner();
          activeSpinner.start(step.message);
        } else {
          activeSpinner.message(step.message);
        }
        return undefined;
      case "select":
        return prompt(clack.select(step));
      case "text":
        return prompt(clack.text(step));
      case "warning":
        clack.log.warn(step.message);
        return undefined;
    }
  };

  return [handle, stopSpinner];
}

async function clackDriver<T>(generator: AsyncGenerator<Step, T, StepResponse>): Promise<T> {
  const [handle, cleanup] = clackStepHandler();
  return drive(generator, handle, cleanup);
}

export { clackDriver };
