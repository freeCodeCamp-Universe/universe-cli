import { describe, it, expect } from "vitest";
import {
  CliError,
  ConfigError,
  ConfirmError,
  CredentialError,
  GitError,
  StorageError,
} from "../src/errors.js";
import {
  EXIT_CONFIG,
  EXIT_CONFIRM,
  EXIT_CREDENTIALS,
  EXIT_GIT,
  EXIT_STORAGE,
} from "../src/output/exit-codes.js";

describe("CliError hierarchy (post-pivot)", () => {
  it("ConfigError extends CliError with exitCode EXIT_CONFIG", () => {
    const err = new ConfigError("bad config");
    expect(err).toBeInstanceOf(CliError);
    expect(err).toBeInstanceOf(Error);
    expect(err.exitCode).toBe(EXIT_CONFIG);
    expect(err.message).toBe("bad config");
  });

  it("CredentialError carries EXIT_CREDENTIALS", () => {
    expect(new CredentialError("x").exitCode).toBe(EXIT_CREDENTIALS);
  });

  it("StorageError carries EXIT_STORAGE", () => {
    expect(new StorageError("x").exitCode).toBe(EXIT_STORAGE);
  });

  it("GitError carries EXIT_GIT", () => {
    expect(new GitError("x").exitCode).toBe(EXIT_GIT);
  });

  it("ConfirmError carries EXIT_CONFIRM", () => {
    expect(new ConfirmError("x").exitCode).toBe(EXIT_CONFIRM);
  });

  it("preserves the error name for instanceof-style checks", () => {
    expect(new ConfigError("x").name).toBe("ConfigError");
    expect(new StorageError("x").name).toBe("StorageError");
  });
});
