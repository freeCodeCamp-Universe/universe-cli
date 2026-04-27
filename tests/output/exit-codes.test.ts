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

  // F5 — round-trip contract. Locks the FULL set so future renumbering
  // (or dropping a "reserved" code) breaks tests, not consumers.
  // CLAUDE.md flags EXIT_OUTPUT_DIR / EXIT_ALIAS / EXIT_DEPLOY_NOT_FOUND
  // as reserved-with-no-callers; this snapshot enforces "reserved
  // means stable, not free to renumber".
  it("exposes the full numeric contract without duplicates", () => {
    const codes = {
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
    };
    expect(codes).toEqual({
      EXIT_SUCCESS: 0,
      EXIT_USAGE: 10,
      EXIT_CONFIG: 11,
      EXIT_CREDENTIALS: 12,
      EXIT_STORAGE: 13,
      EXIT_OUTPUT_DIR: 14,
      EXIT_GIT: 15,
      EXIT_ALIAS: 16,
      EXIT_DEPLOY_NOT_FOUND: 17,
      EXIT_CONFIRM: 18,
      EXIT_PARTIAL: 19,
    });
    const values = Object.values(codes);
    expect(new Set(values).size).toBe(values.length);
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
