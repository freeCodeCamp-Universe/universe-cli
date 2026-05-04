import type { CreateSelections, Prompt } from "./prompt.port.js";
import { ClackPrompt } from "./clack-prompt.js";
import type { ClackPromptApi } from "./clack-prompt.js";
// oxlint-disable-next-line import/no-namespace
import * as allowedConfig from "../layer-composition/allowed-configuration.js";

const CANCELLED = Symbol("cancelled");

const createMockApi = (
  selectResponses: string[] = ["node", "express", "pnpm"],
  multiselectResponses: string[][] = [["postgresql"], ["auth"]],
): ClackPromptApi => {
  const selectQueue = [...selectResponses];
  const multiselectQueue = [...multiselectResponses];

  return {
    confirm() {
      return Promise.resolve(true);
    },
    isCancel(value: unknown): value is symbol {
      return value === CANCELLED;
    },
    multiselect() {
      return Promise.resolve(multiselectQueue.shift() ?? []);
    },
    select() {
      return Promise.resolve(selectQueue.shift() ?? "None");
    },
    text() {
      return Promise.resolve("hello-universe");
    },
  };
};

describe(ClackPrompt, () => {
  it("prompts in the required order for Node runtime", async () => {
    const events: string[] = [];
    const selectQueue = ["node", "typescript", "pnpm"];
    const mockApi: ClackPromptApi = {
      ...createMockApi(["node", "typescript", "pnpm"], [["none"], ["none"]]),
      confirm() {
        events.push("confirmation");
        return Promise.resolve(true);
      },
      multiselect(options) {
        events.push(options.message);
        return Promise.resolve(["none"]);
      },
      select(options) {
        events.push(options.message);
        const nextSelection = selectQueue.shift() as string;
        return Promise.resolve(nextSelection);
      },
      text(options) {
        events.push(options.message);
        return Promise.resolve("hello-universe");
      },
    };

    const adapter = new ClackPrompt(mockApi);

    await adapter.promptForCreateInputs();

    expect(events).toStrictEqual([
      "Enter project name",
      "Select runtime",
      "Select framework",
      "Select package manager",
      "Select databases",
      "Select platform services",
      "confirmation",
    ]);
  });

  it("prompts for package manager when runtime is static_web (2 package managers)", async () => {
    const events: string[] = [];
    const selectQueue = ["static_web", "html-css-js", "pnpm"];
    const mockApi: ClackPromptApi = {
      ...createMockApi(["static_web", "html-css-js", "pnpm"], [["none"], ["none"]]),
      confirm() {
        events.push("confirmation");
        return Promise.resolve(true);
      },
      multiselect(options) {
        events.push(options.message);
        return Promise.resolve(["none"]);
      },
      select(options) {
        events.push(options.message);
        const nextSelection = selectQueue.shift() as string;
        return Promise.resolve(nextSelection);
      },
      text(options) {
        events.push(options.message);
        return Promise.resolve("hello-universe");
      },
    };

    const adapter = new ClackPrompt(mockApi);

    await adapter.promptForCreateInputs();

    expect(events).toStrictEqual([
      "Enter project name",
      "Select runtime",
      "Select framework",
      "Select package manager",
      "Select platform services",
      "confirmation",
    ]);
  });

  it("returns null when cancelled", async () => {
    const mockApi: ClackPromptApi = {
      ...createMockApi(),
      text() {
        return Promise.resolve(CANCELLED);
      },
    };

    const adapter = new ClackPrompt(mockApi);

    const result = await adapter.promptForCreateInputs();

    expect(result).toBeNull();
  });

  it("provides actionable validation feedback for invalid names", async () => {
    let validationMessage = "";
    const mockApi: ClackPromptApi = {
      ...createMockApi(),
      text(options) {
        const validate = options.validate as (
          value: string | undefined,
        ) => string | Error | undefined;
        validationMessage = validate("InvalidName") as string;
        return Promise.resolve("hello-universe");
      },
    };

    const adapter = new ClackPrompt(mockApi);

    await adapter.promptForCreateInputs();

    expect(validationMessage).toBe(
      "Name must be lowercase kebab-case, start with a letter, and be 3–50 characters long.",
    );
  });

  it("returns selected values including package manager for Node runtime", async () => {
    const expected: CreateSelections = {
      confirmed: true,
      databases: ["postgresql", "redis"],
      framework: "express",
      name: "hello-universe",
      packageManager: "pnpm",
      platformServices: ["auth", "analytics"],
      runtime: "node",
    };

    const mockApi = createMockApi(
      ["node", "express", "pnpm"],
      [
        ["postgresql", "redis"],
        ["auth", "analytics"],
      ],
    );

    const adapter: Prompt = new ClackPrompt(mockApi);

    const result = await adapter.promptForCreateInputs();

    expect(result).toStrictEqual(expected);
  });

  it("returns selected values with package manager for Static runtime", async () => {
    const expected: CreateSelections = {
      confirmed: true,
      databases: [],
      framework: "html-css-js",
      name: "hello-universe",
      packageManager: "pnpm",
      platformServices: [],
      runtime: "static_web",
    };

    const mockApi = createMockApi(["static_web", "html-css-js", "pnpm"], [[], []]);

    const adapter: Prompt = new ClackPrompt(mockApi);

    const result = await adapter.promptForCreateInputs();

    expect(result).toStrictEqual(expected);
  });

  it("auto-selects the sole package manager without showing the prompt", async () => {
    vi.spyOn(allowedConfig, "packageManagerOptions").mockReturnValue(["pnpm"]);
    const events: string[] = [];
    const selectQueue = ["node", "express", "pnpm"];
    const mockApi: ClackPromptApi = {
      ...createMockApi(["node", "express", "pnpm"], [[], []]),
      select(options) {
        events.push(options.message);
        const nextSelection = selectQueue.shift() as string;
        return Promise.resolve(nextSelection);
      },
    };

    const adapter = new ClackPrompt(mockApi);
    const result = await adapter.promptForCreateInputs();

    expect(result?.packageManager).toBe("pnpm");
    expect(events).not.toContain("Select package manager");
  });

  it("includes package manager in confirmation message for Node runtime", async () => {
    let confirmMessage = "";
    const mockApi: ClackPromptApi = {
      ...createMockApi(["node", "express", "pnpm"], [["none"], ["none"]]),
      confirm(options) {
        confirmMessage = options.message;
        return Promise.resolve(true);
      },
    };

    const adapter = new ClackPrompt(mockApi);

    await adapter.promptForCreateInputs();

    expect(confirmMessage).toContain("Package manager");
    expect(confirmMessage).toContain("pnpm");
  });
});
