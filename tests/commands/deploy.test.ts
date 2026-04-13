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
  writeAlias: vi.fn(),
}));
vi.mock("../../src/storage/operations.js", () => ({
  listObjects: vi.fn(),
}));
vi.mock("../../src/deploy/id.js", () => ({
  generateDeployId: vi.fn(),
}));
vi.mock("../../src/deploy/git.js", () => ({
  getGitState: vi.fn(),
}));
vi.mock("../../src/deploy/preflight.js", () => ({
  validateOutputDir: vi.fn(),
}));
vi.mock("../../src/deploy/upload.js", () => ({
  uploadDirectory: vi.fn(),
}));
vi.mock("../../src/deploy/metadata.js", () => ({
  writeDeployMetadata: vi.fn(),
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

import { loadConfig } from "../../src/config/loader.js";
import { resolveCredentials } from "../../src/credentials/resolver.js";
import { createS3Client } from "../../src/storage/client.js";
import { writeAlias } from "../../src/storage/aliases.js";
import { listObjects } from "../../src/storage/operations.js";
import { generateDeployId } from "../../src/deploy/id.js";
import { getGitState } from "../../src/deploy/git.js";
import { validateOutputDir } from "../../src/deploy/preflight.js";
import { uploadDirectory } from "../../src/deploy/upload.js";
import { writeDeployMetadata } from "../../src/deploy/metadata.js";
import { outputSuccess, outputError } from "../../src/output/format.js";
import {
  exitWithCode,
  EXIT_GIT,
  EXIT_OUTPUT_DIR,
  EXIT_PARTIAL,
} from "../../src/output/exit-codes.js";
import { deploy } from "../../src/commands/deploy.js";

const mockLoadConfig = vi.mocked(loadConfig);
const mockResolveCredentials = vi.mocked(resolveCredentials);
const mockCreateS3Client = vi.mocked(createS3Client);
const mockWriteAlias = vi.mocked(writeAlias);
const mockListObjects = vi.mocked(listObjects);
const mockGenerateDeployId = vi.mocked(generateDeployId);
const mockGetGitState = vi.mocked(getGitState);
const mockValidateOutputDir = vi.mocked(validateOutputDir);
const mockUploadDirectory = vi.mocked(uploadDirectory);
const mockWriteDeployMetadata = vi.mocked(writeDeployMetadata);
const mockOutputSuccess = vi.mocked(outputSuccess);
const mockOutputError = vi.mocked(outputError);
const mockExitWithCode = vi.mocked(exitWithCode);

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
  mockGetGitState.mockReturnValue({ hash: "abc1234def5678", dirty: false });
  mockGenerateDeployId.mockReturnValue("20260413-120000-abc1234");
  mockValidateOutputDir.mockReturnValue({ valid: true, fileCount: 5 });
  mockListObjects.mockResolvedValue([]);
  mockUploadDirectory.mockResolvedValue({
    fileCount: 5,
    totalSize: 2048,
    errors: [],
  });
  mockWriteDeployMetadata.mockResolvedValue(undefined);
  mockWriteAlias.mockResolvedValue(undefined);
});

describe("deploy", () => {
  it("follows the full pipeline: config -> credentials -> client -> git -> id -> preflight -> upload -> metadata -> alias -> output", async () => {
    await deploy({ json: false });

    expect(mockLoadConfig).toHaveBeenCalled();
    expect(mockResolveCredentials).toHaveBeenCalled();
    expect(mockCreateS3Client).toHaveBeenCalled();
    expect(mockGetGitState).toHaveBeenCalled();
    expect(mockGenerateDeployId).toHaveBeenCalled();
    expect(mockValidateOutputDir).toHaveBeenCalled();
    expect(mockUploadDirectory).toHaveBeenCalled();
    expect(mockWriteDeployMetadata).toHaveBeenCalled();
    expect(mockWriteAlias).toHaveBeenCalled();
    expect(mockOutputSuccess).toHaveBeenCalled();
  });

  it("exits with EXIT_GIT when git hash is missing and no --force", async () => {
    mockGetGitState.mockReturnValue({ hash: null, dirty: false });

    await deploy({ json: false });

    expect(mockExitWithCode).toHaveBeenCalledWith(EXIT_GIT, expect.any(String));
    expect(mockUploadDirectory).not.toHaveBeenCalled();
  });

  it("continues without git hash when --force is set", async () => {
    mockGetGitState.mockReturnValue({ hash: null, dirty: false });

    await deploy({ json: false, force: true });

    expect(mockExitWithCode).not.toHaveBeenCalled();
    expect(mockUploadDirectory).toHaveBeenCalled();
  });

  it("exits with EXIT_OUTPUT_DIR when output dir is invalid", async () => {
    mockValidateOutputDir.mockReturnValue({
      valid: false,
      fileCount: 0,
      error: "directory not found",
    });

    await deploy({ json: false });

    expect(mockExitWithCode).toHaveBeenCalledWith(
      EXIT_OUTPUT_DIR,
      expect.any(String),
    );
    expect(mockUploadDirectory).not.toHaveBeenCalled();
  });

  it("writes preview alias after successful upload", async () => {
    await deploy({ json: false });

    expect(mockWriteAlias).toHaveBeenCalledWith(
      expect.anything(),
      "test-bucket",
      "my-site",
      "preview",
      "20260413-120000-abc1234",
    );
  });

  it("passes --output-dir flag to config loader", async () => {
    await deploy({ json: false, outputDir: "build" });

    expect(mockLoadConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        flags: expect.objectContaining({ outputDir: "build" }),
      }),
    );
  });

  it("supports --json flag for JSON envelope output", async () => {
    await deploy({ json: true });

    expect(mockOutputSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ json: true, command: "deploy" }),
      expect.any(String),
      expect.objectContaining({ deployId: "20260413-120000-abc1234" }),
    );
  });

  it("retries with new deploy ID on collision", async () => {
    mockListObjects
      .mockResolvedValueOnce([
        {
          key: "my-site/deploys/20260413-120000-abc1234/index.html",
          size: 100,
          lastModified: new Date(),
        },
      ])
      .mockResolvedValueOnce([]);
    mockGenerateDeployId
      .mockReturnValueOnce("20260413-120000-abc1234")
      .mockReturnValueOnce("20260413-120001-abc1234");

    await deploy({ json: false });

    expect(mockGenerateDeployId).toHaveBeenCalledTimes(2);
    expect(mockUploadDirectory).toHaveBeenCalled();
  });

  it("logs warning when git is dirty but continues", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockGetGitState.mockReturnValue({ hash: "abc1234def5678", dirty: true });

    await deploy({ json: false });

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("dirty"));
    expect(mockUploadDirectory).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("exits with EXIT_PARTIAL and skips alias when upload has errors", async () => {
    mockUploadDirectory.mockResolvedValue({
      fileCount: 3,
      totalSize: 1024,
      errors: ["bad.css: Upload failed", "img.png: Timeout"],
    });

    await deploy({ json: false });

    expect(mockOutputError).toHaveBeenCalledWith(
      expect.objectContaining({ command: "deploy" }),
      EXIT_PARTIAL,
      expect.any(String),
      expect.arrayContaining(["bad.css: Upload failed", "img.png: Timeout"]),
    );
    expect(mockExitWithCode).toHaveBeenCalledWith(
      EXIT_PARTIAL,
      expect.any(String),
    );
    expect(mockWriteAlias).not.toHaveBeenCalled();
  });

  it("writes deploy metadata with correct fields", async () => {
    await deploy({ json: false });

    expect(mockWriteDeployMetadata).toHaveBeenCalledWith(
      expect.anything(),
      "test-bucket",
      "my-site",
      "20260413-120000-abc1234",
      expect.objectContaining({
        deployId: "20260413-120000-abc1234",
        gitHash: "abc1234def5678",
        gitDirty: false,
        fileCount: 5,
        totalSize: 2048,
      }),
    );
  });
});
