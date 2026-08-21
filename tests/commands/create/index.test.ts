import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clackDriver: vi.fn(),
  create: vi.fn(),
  emitJson: vi.fn(),
  exitWithCode: vi.fn(),
  logError: vi.fn(),
  outputError: vi.fn(() => 10),
  silentDrive: vi.fn(),
  success: vi.fn(),
}));

vi.mock("@clack/prompts", () => ({ log: { error: mocks.logError, success: mocks.success } }));
vi.mock("@freecodecamp/universe-create", () => ({
  clackDriver: mocks.clackDriver,
  create: mocks.create,
  emitJson: mocks.emitJson,
  exitWithCode: mocks.exitWithCode,
  outputError: mocks.outputError,
  silentDrive: mocks.silentDrive,
}));

import { createHandler } from "../../../src/commands/create/index.js";

const result = {
  data: { command: "create", schemaVersion: "1", success: true },
  format: "Project created",
};
const generator = {} as ReturnType<typeof mocks.create>;

describe(createHandler, () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses the interactive driver for a text TTY invocation", async () => {
    mocks.create.mockReturnValue(generator);
    mocks.clackDriver.mockResolvedValue(result);

    await createHandler({ json: false }, { isTTY: true });

    expect(mocks.clackDriver).toHaveBeenCalledWith(generator);
  });

  it("uses the silent driver for JSON output", async () => {
    mocks.create.mockReturnValue(generator);
    mocks.silentDrive.mockResolvedValue(result);

    await createHandler({ json: true }, { isTTY: true });

    expect(mocks.silentDrive).toHaveBeenCalledWith(generator);
  });

  it("renders successful text output", async () => {
    mocks.create.mockReturnValue(generator);
    mocks.silentDrive.mockResolvedValue(result);

    await createHandler({ json: false, yes: true });

    expect(mocks.success).toHaveBeenCalledWith("Project created");
  });

  it("emits successful JSON output", async () => {
    mocks.create.mockReturnValue(generator);
    mocks.silentDrive.mockResolvedValue(result);

    await createHandler({ json: true });

    expect(mocks.emitJson).toHaveBeenCalledWith(result.data);
  });

  it("maps errors and applies the returned exit code", async () => {
    const error = new Error("create failed");
    mocks.create.mockReturnValue(generator);
    mocks.silentDrive.mockRejectedValue(error);

    await createHandler({ json: false, yes: true });

    expect({
      exit: mocks.exitWithCode.mock.calls,
      output: mocks.outputError.mock.calls,
    }).toEqual({
      exit: [[10]],
      output: [[{ command: "create", json: false }, error, { logError: expect.any(Function) }]],
    });
  });
});
