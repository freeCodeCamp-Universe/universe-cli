import type { Step, StepResponse } from "./step.js";

type CommandDriver = <T>(generator: AsyncGenerator<Step, T, StepResponse>) => Promise<T>;
type StepHandler = (step: Step) => Promise<StepResponse>;

async function drive<T>(
  generator: AsyncGenerator<Step, T, StepResponse>,
  handle: StepHandler,
  cleanup: () => void,
): Promise<T> {
  try {
    let next = await generator.next();
    while (!next.done) {
      next = await generator.next(await handle(next.value));
    }
    cleanup();
    return next.value;
  } catch (error) {
    cleanup();
    throw error;
  }
}

export { drive };
export type { CommandDriver, StepHandler };
