import type { Step, StepResponse } from "./step.js";

type StepHandler = (step: Step) => Promise<StepResponse>;

async function drive<T>(
  gen: AsyncGenerator<Step, T, StepResponse>,
  handle: StepHandler,
  cleanup: () => void,
): Promise<T> {
  try {
    let next = await gen.next();
    while (!next.done) {
      next = await gen.next(await handle(next.value));
    }
    cleanup();
    return next.value;
  } catch (err) {
    cleanup();
    throw err;
  }
}

export { drive };
export type { StepHandler };
