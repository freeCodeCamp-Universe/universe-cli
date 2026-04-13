import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/config/loader.js", () => ({
  loadConfig: vi.fn(),
}));
vi.mock("../../src/credentials/resolver.js", () => ({
  resolveCredentials: vi.fn(),
}));
vi.mock("../../src/storage/client.js", () => ({
  createS3Client: vi.fn(),
}));
vi.mock("../../src/storage/aliases.js", () => ({
  readAlias: vi.fn(),
  writeAlias: vi.fn(),
}));
vi.mock("../../src/storage/deploys.js", () => ({
  listDeploys: vi.fn(),
}));
vi.mock("../../src/output/format.js", () => ({
  outputSuccess: vi.fn(),
  outputError: vi.fn(),
}));
vi.mock("../../src/output/exit-codes.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/output/exit-codes.js")
  >("../../src/output/exit-codes.js");
  return {
    ...actual,
    exitWithCode: vi.fn(),
  };
});
vi.mock("@clack/prompts", () => ({
  confirm: vi.fn(),
  log: { success: vi.fn(), error: vi.fn() },
}));

import { loadConfig } from "../../src/config/loader.js";
import { resolveCredentials } from "../../src/credentials/resolver.js";
import { createS3Client } from "../../src/storage/client.js";
import { readAlias, writeAlias } from "../../src/storage/aliases.js";
import { listDeploys } from "../../src/storage/deploys.js";
import { outputSuccess, outputError } from "../../src/output/format.js";
import {
  exitWithCode,
  EXIT_ALIAS,
  EXIT_CONFIRM,
} from "../../src/output/exit-codes.js";
import { confirm } from "@clack/prompts";
import { rollback } from "../../src/commands/rollback.js";

const mockLoadConfig = vi.mocked(loadConfig);
const mockResolveCredentials = vi.mocked(resolveCredentials);
const mockCreateS3Client = vi.mocked(createS3Client);
const mockReadAlias = vi.mocked(readAlias);
const mockWriteAlias = vi.mocked(writeAlias);
const mockListDeploys = vi.mocked(listDeploys);
const mockOutputSuccess = vi.mocked(outputSuccess);
const mockOutputError = vi.mocked(outputError);
const mockExitWithCode = vi.mocked(exitWithCode);
const mockConfirm = vi.mocked(confirm);

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadConfig.mockReturnValue({
    name: "my-site",
    stack: "static",
    domain: { production: "example.com", preview: "preview.example.com" },
    static: {
      output_dir: "dist",
      bucket: "test-bucket",
      rclone_remote: "r2",
      region: "auto",
    },
  });
  mockResolveCredentials.mockReturnValue({
    accessKeyId: "key",
    secretAccessKey: "secret",
    endpoint: "https://example.com",
  });
  mockCreateS3Client.mockReturnValue({} as ReturnType<typeof createS3Client>);
});

describe("rollback", () => {
  it("rolls back production to previous deploy with --confirm flag", async () => {
    mockReadAlias.mockResolvedValue("20260413-120000-ccc3333");
    mockListDeploys.mockResolvedValue([
      "20260413-120000-ccc3333",
      "20260412-110000-bbb2222",
      "20260411-100000-aaa1111",
    ]);
    mockWriteAlias.mockResolvedValue(undefined);

    await rollback({ json: false, confirm: true });

    expect(mockReadAlias).toHaveBeenCalledWith(
      expect.anything(),
      "test-bucket",
      "my-site",
      "production",
    );
    expect(mockWriteAlias).toHaveBeenCalledWith(
      expect.anything(),
      "test-bucket",
      "my-site",
      "production",
      "20260412-110000-bbb2222",
    );
    expect(mockOutputSuccess).toHaveBeenCalled();
  });

  it("prompts for confirmation in human mode when --confirm not provided", async () => {
    mockReadAlias.mockResolvedValue("20260413-120000-ccc3333");
    mockListDeploys.mockResolvedValue([
      "20260413-120000-ccc3333",
      "20260412-110000-bbb2222",
    ]);
    mockConfirm.mockResolvedValue(true);
    mockWriteAlias.mockResolvedValue(undefined);

    await rollback({ json: false, confirm: false });

    expect(mockConfirm).toHaveBeenCalled();
    expect(mockWriteAlias).toHaveBeenCalledWith(
      expect.anything(),
      "test-bucket",
      "my-site",
      "production",
      "20260412-110000-bbb2222",
    );
  });

  it("aborts when user declines confirmation prompt", async () => {
    mockReadAlias.mockResolvedValue("20260413-120000-ccc3333");
    mockListDeploys.mockResolvedValue([
      "20260413-120000-ccc3333",
      "20260412-110000-bbb2222",
    ]);
    mockConfirm.mockResolvedValue(false);

    await rollback({ json: false, confirm: false });

    expect(mockWriteAlias).not.toHaveBeenCalled();
  });

  it("exits with EXIT_ALIAS when production alias not set", async () => {
    mockReadAlias.mockResolvedValue(null);

    await rollback({ json: false, confirm: true });

    expect(mockExitWithCode).toHaveBeenCalledWith(
      EXIT_ALIAS,
      expect.any(String),
    );
    expect(mockWriteAlias).not.toHaveBeenCalled();
  });

  it("exits with EXIT_ALIAS when only one deploy exists", async () => {
    mockReadAlias.mockResolvedValue("20260413-120000-ccc3333");
    mockListDeploys.mockResolvedValue(["20260413-120000-ccc3333"]);

    await rollback({ json: false, confirm: true });

    expect(mockExitWithCode).toHaveBeenCalledWith(
      EXIT_ALIAS,
      expect.stringContaining("no previous deploy"),
    );
    expect(mockWriteAlias).not.toHaveBeenCalled();
  });

  it("exits with EXIT_CONFIRM in json mode when --confirm not provided", async () => {
    mockReadAlias.mockResolvedValue("20260413-120000-ccc3333");
    mockListDeploys.mockResolvedValue([
      "20260413-120000-ccc3333",
      "20260412-110000-bbb2222",
    ]);

    await rollback({ json: true, confirm: false });

    expect(mockExitWithCode).toHaveBeenCalledWith(
      EXIT_CONFIRM,
      expect.any(String),
    );
    expect(mockWriteAlias).not.toHaveBeenCalled();
  });

  it("outputs JSON when --json flag is set", async () => {
    mockReadAlias.mockResolvedValue("20260413-120000-ccc3333");
    mockListDeploys.mockResolvedValue([
      "20260413-120000-ccc3333",
      "20260412-110000-bbb2222",
    ]);
    mockWriteAlias.mockResolvedValue(undefined);

    await rollback({ json: true, confirm: true });

    expect(mockOutputSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ json: true, command: "rollback" }),
      expect.any(String),
      expect.objectContaining({
        previousDeployId: "20260413-120000-ccc3333",
        rolledBackTo: "20260412-110000-bbb2222",
      }),
    );
  });

  it("follows the pipeline: loadConfig -> resolveCredentials -> createS3Client", async () => {
    mockReadAlias.mockResolvedValue("20260413-120000-ccc3333");
    mockListDeploys.mockResolvedValue([
      "20260413-120000-ccc3333",
      "20260412-110000-bbb2222",
    ]);
    mockWriteAlias.mockResolvedValue(undefined);

    await rollback({ json: false, confirm: true });

    expect(mockLoadConfig).toHaveBeenCalled();
    expect(mockResolveCredentials).toHaveBeenCalled();
    expect(mockCreateS3Client).toHaveBeenCalled();
  });
});
