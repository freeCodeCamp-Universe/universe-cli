import { describe, it, expect, vi, afterEach } from "vitest";
import {
  EXIT_SUCCESS,
  EXIT_USAGE,
  EXIT_CONFIG,
  EXIT_CREDENTIALS,
  EXIT_STORAGE,
  EXIT_OUTPUT_DIR,
  EXIT_GIT,
  EXIT_ALIAS,
  EXIT_DEPLOY_NOT_FOUND,
  EXIT_CONFIRM,
  EXIT_PARTIAL,
  EXIT_PIPELINE,
  exitWithCode,
} from "../../src/output/exit-codes.js";

describe("exit code constants", () => {
  it("EXIT_SUCCESS is 0", () => {
    expect(EXIT_SUCCESS).toBe(0);
  });

  it("EXIT_USAGE is 10", () => {
    expect(EXIT_USAGE).toBe(10);
  });

  it("EXIT_CONFIG is 11", () => {
    expect(EXIT_CONFIG).toBe(11);
  });

  it("EXIT_CREDENTIALS is 12", () => {
    expect(EXIT_CREDENTIALS).toBe(12);
  });

  it("EXIT_STORAGE is 13", () => {
    expect(EXIT_STORAGE).toBe(13);
  });

  it("EXIT_OUTPUT_DIR is 14", () => {
    expect(EXIT_OUTPUT_DIR).toBe(14);
  });

  it("EXIT_GIT is 15", () => {
    expect(EXIT_GIT).toBe(15);
  });

  it("EXIT_ALIAS is 16", () => {
    expect(EXIT_ALIAS).toBe(16);
  });

  it("EXIT_DEPLOY_NOT_FOUND is 17", () => {
    expect(EXIT_DEPLOY_NOT_FOUND).toBe(17);
  });

  it("EXIT_CONFIRM is 18", () => {
    expect(EXIT_CONFIRM).toBe(18);
  });

  it("EXIT_PARTIAL is 19", () => {
    expect(EXIT_PARTIAL).toBe(19);
  });

  it("EXIT_PIPELINE is 20", () => {
    expect(EXIT_PIPELINE).toBe(20);
  });
});

describe("exitWithCode", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls process.exit with the given code", () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => {}) as never);
    exitWithCode(11);
    expect(exitSpy).toHaveBeenCalledWith(11);
  });

  it("writes message to stderr when provided", () => {
    vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    exitWithCode(12, "credential error");
    expect(stderrSpy).toHaveBeenCalledWith("credential error\n");
  });

  it("does not write to stderr when no message provided", () => {
    vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    exitWithCode(0);
    expect(stderrSpy).not.toHaveBeenCalled();
  });
});
