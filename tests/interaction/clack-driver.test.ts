import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { clackDriver } from "../../src/interaction/clack-driver.js";
import type { Step, StepResponse } from "../../src/interaction/step.js";
import type { CommandResult } from "../../src/output/command-result.js";
import { ConfirmError } from "../../src/errors.js";

// Mock @clack/prompts
vi.mock("@clack/prompts", () => {
  const spinnerInstance = {
    start: vi.fn(),
    stop: vi.fn(),
    message: vi.fn(),
  };
  return {
    text: vi.fn(),
    select: vi.fn(),
    multiselect: vi.fn(),
    confirm: vi.fn(),
    spinner: vi.fn(() => spinnerInstance),
    isCancel: vi.fn(() => false),
    log: {
      warn: vi.fn(),
      info: vi.fn(),
    },
    __spinnerInstance: spinnerInstance,
  };
});

import * as clack from "@clack/prompts";

const mockClack = clack as unknown as {
  text: Mock;
  select: Mock;
  multiselect: Mock;
  confirm: Mock;
  spinner: Mock;
  isCancel: Mock;
  log: { warn: Mock; info: Mock };
  __spinnerInstance: { start: Mock; stop: Mock; message: Mock };
};

const dummyResult: CommandResult = {
  data: {
    schemaVersion: "1",
    command: "test",
    success: true,
    timestamp: "2026-01-01T00:00:00.000Z",
  },
  format: "done",
};

async function* singleStepGen(
  step: Step,
): AsyncGenerator<Step, CommandResult, StepResponse> {
  yield step;
  return dummyResult;
}

describe("clackDriver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps text step to clack.text and passes response back", async () => {
    mockClack.text.mockResolvedValueOnce("my-project");

    const gen = singleStepGen({
      type: "text",
      field: "name",
      message: "Project name",
      placeholder: "my-app",
    });

    const result = await clackDriver(gen);

    expect(mockClack.text).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Project name",
        placeholder: "my-app",
      }),
    );
    expect(result).toEqual(dummyResult);
  });

  it("maps select step to clack.select", async () => {
    mockClack.select.mockResolvedValueOnce("node");

    const options = [
      { value: "node", label: "Node.js" },
      { value: "bun", label: "Bun" },
    ];

    const gen = singleStepGen({
      type: "select",
      field: "runtime",
      message: "Select runtime",
      options,
    });

    const result = await clackDriver(gen);

    expect(mockClack.select).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Select runtime",
        options,
      }),
    );
    expect(result).toEqual(dummyResult);
  });

  it("maps multiselect step to clack.multiselect", async () => {
    mockClack.multiselect.mockResolvedValueOnce(["pg", "redis"]);

    const options = [
      { value: "pg", label: "PostgreSQL" },
      { value: "redis", label: "Redis" },
    ];

    const gen = singleStepGen({
      type: "multiselect",
      field: "databases",
      message: "Select databases",
      options,
      required: false,
    });

    const result = await clackDriver(gen);

    expect(mockClack.multiselect).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Select databases",
        options,
        required: false,
      }),
    );
    expect(result).toEqual(dummyResult);
  });

  it("maps confirm step to clack.confirm", async () => {
    mockClack.confirm.mockResolvedValueOnce(true);

    const gen = singleStepGen({
      type: "confirm",
      field: "proceed",
      message: "Continue?",
      initialValue: true,
    });

    const result = await clackDriver(gen);

    expect(mockClack.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Continue?",
        initialValue: true,
      }),
    );
    expect(result).toEqual(dummyResult);
  });

  it("starts spinner on first progress step and updates message on subsequent ones", async () => {
    async function* progressGen(): AsyncGenerator<Step, CommandResult, StepResponse> {
      yield { type: "progress", message: "Starting" };
      yield { type: "progress", message: "Halfway" };
      return dummyResult;
    }

    await clackDriver(progressGen());

    expect(mockClack.__spinnerInstance.start).toHaveBeenCalledWith("Starting");
    expect(mockClack.__spinnerInstance.message).toHaveBeenCalledWith("Halfway");
    expect(mockClack.__spinnerInstance.stop).toHaveBeenCalled();
  });

  it("stops spinner before a prompt step", async () => {
    mockClack.confirm.mockResolvedValueOnce(true);

    async function* mixedGen(): AsyncGenerator<Step, CommandResult, StepResponse> {
      yield { type: "progress", message: "Loading" };
      yield { type: "confirm", field: "ok", message: "OK?" };
      return dummyResult;
    }

    await clackDriver(mixedGen());

    // stop should be called before confirm
    expect(mockClack.__spinnerInstance.stop).toHaveBeenCalled();
    expect(mockClack.confirm).toHaveBeenCalled();
  });

  it("shows warning via clack.log.warn", async () => {
    const gen = singleStepGen({
      type: "warning",
      message: "Watch out",
    });

    await clackDriver(gen);

    expect(mockClack.log.warn).toHaveBeenCalledWith("Watch out");
  });

  it("shows info via clack.log.info", async () => {
    const gen = singleStepGen({
      type: "info",
      message: "FYI",
    });

    await clackDriver(gen);

    expect(mockClack.log.info).toHaveBeenCalledWith("FYI");
  });

  it("throws ConfirmError when user cancels a prompt", async () => {
    mockClack.isCancel.mockReturnValueOnce(true);
    mockClack.text.mockResolvedValueOnce(Symbol("cancel"));

    const gen = singleStepGen({
      type: "text",
      field: "name",
      message: "Name",
    });

    await expect(clackDriver(gen)).rejects.toThrow(ConfirmError);
  });

  it("stops spinner on error", async () => {
    async function* errorGen(): AsyncGenerator<Step, CommandResult, StepResponse> {
      yield { type: "progress", message: "Working" };
      throw new Error("boom");
    }

    await expect(clackDriver(errorGen())).rejects.toThrow("boom");
    expect(mockClack.__spinnerInstance.stop).toHaveBeenCalled();
  });

  it("passes validate directly to clack.text", async () => {
    const validate = (v: string | undefined) => (v !== undefined && v.length < 3 ? "Too short" : undefined);
    mockClack.text.mockResolvedValueOnce("ok");

    const gen = singleStepGen({
      type: "text",
      field: "name",
      message: "Name",
      validate,
    });

    await clackDriver(gen);

    const callArgs = mockClack.text.mock.lastCall![0] as { validate: (v: string | undefined) => string | undefined };
    expect(callArgs.validate).toBe(validate);
  });
});
