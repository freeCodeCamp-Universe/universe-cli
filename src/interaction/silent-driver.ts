import { drive } from "./driver.js";
import type { Step, StepResponse } from "./step.js";

const silentHandler = async (step: Step): Promise<StepResponse> =>
  step.type === "confirm" ? false : undefined;

async function silentDrive<T>(gen: AsyncGenerator<Step, T, StepResponse>): Promise<T> {
  return drive(gen, silentHandler, () => {});
}

export { silentDrive };
