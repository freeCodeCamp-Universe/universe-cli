import type { Step, StepResponse } from "./step.js";

async function silentDrive<T>(gen: AsyncGenerator<Step, T, StepResponse>): Promise<T> {
  let next = await gen.next();
  while (!next.done) {
    const step = next.value;
    next = await gen.next(step.type === "confirm" ? false : undefined);
  }
  return next.value;
}

export { silentDrive };
