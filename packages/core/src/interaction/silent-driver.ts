import { drive } from "./driver.js";
import type { Step, StepResponse } from "./step.js";

const silentHandler = async (step: Step): Promise<StepResponse> =>
  step.type === "confirm" ? false : undefined;

async function silentDrive<T>(generator: AsyncGenerator<Step, T, StepResponse>): Promise<T> {
  return drive(generator, silentHandler, () => {});
}

export { silentDrive };
