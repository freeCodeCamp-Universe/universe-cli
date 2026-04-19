import { describe, it, expect } from "vitest";
import {
  CliError,
  ConfigError,
  CredentialError,
  StorageError,
  OutputDirError,
  GitError,
  AliasError,
  DeployNotFoundError,
  ConfirmError,
} from "../src/errors.js";
import {
  EXIT_CONFIG,
  EXIT_CREDENTIALS,
  EXIT_STORAGE,
  EXIT_OUTPUT_DIR,
  EXIT_GIT,
  EXIT_ALIAS,
  EXIT_DEPLOY_NOT_FOUND,
  EXIT_CONFIRM,
} from "../src/output/exit-codes.js";

describe("CliError hierarchy", () => {
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

  it("OutputDirError carries EXIT_OUTPUT_DIR", () => {
    expect(new OutputDirError("x").exitCode).toBe(EXIT_OUTPUT_DIR);
  });

  it("GitError carries EXIT_GIT", () => {
    expect(new GitError("x").exitCode).toBe(EXIT_GIT);
  });

  it("AliasError carries EXIT_ALIAS", () => {
    expect(new AliasError("x").exitCode).toBe(EXIT_ALIAS);
  });

  it("DeployNotFoundError carries EXIT_DEPLOY_NOT_FOUND", () => {
    expect(new DeployNotFoundError("x").exitCode).toBe(EXIT_DEPLOY_NOT_FOUND);
  });

  it("ConfirmError carries EXIT_CONFIRM", () => {
    expect(new ConfirmError("x").exitCode).toBe(EXIT_CONFIRM);
  });

  it("preserves the error name for instanceof-style checks", () => {
    expect(new ConfigError("x").name).toBe("ConfigError");
    expect(new StorageError("x").name).toBe("StorageError");
  });
});
