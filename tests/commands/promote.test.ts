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
  deployExists: vi.fn(),
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
import { readAlias, writeAlias } from "../../src/storage/aliases.js";
import { deployExists } from "../../src/storage/deploys.js";
import { outputSuccess } from "../../src/output/format.js";
import {
  exitWithCode,
  EXIT_ALIAS,
  EXIT_DEPLOY_NOT_FOUND,
} from "../../src/output/exit-codes.js";
import { promote } from "../../src/commands/promote.js";

const mockLoadConfig = vi.mocked(loadConfig);
const mockResolveCredentials = vi.mocked(resolveCredentials);
const mockCreateS3Client = vi.mocked(createS3Client);
const mockReadAlias = vi.mocked(readAlias);
const mockWriteAlias = vi.mocked(writeAlias);
const mockDeployExists = vi.mocked(deployExists);
const mockOutputSuccess = vi.mocked(outputSuccess);
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
});

describe("promote", () => {
  it("promotes preview alias to production when no deploy-id arg", async () => {
    mockReadAlias.mockResolvedValue("20260413-120000-abc1234");
    mockDeployExists.mockResolvedValue(true);
    mockWriteAlias.mockResolvedValue(undefined);

    await promote({ json: false });

    expect(mockReadAlias).toHaveBeenCalledWith(
      expect.anything(),
      "test-bucket",
      "my-site",
      "preview",
    );
    expect(mockWriteAlias).toHaveBeenCalledWith(
      expect.anything(),
      "test-bucket",
      "my-site",
      "production",
      "20260413-120000-abc1234",
    );
    expect(mockOutputSuccess).toHaveBeenCalled();
  });

  it("promotes a specific deploy-id when provided", async () => {
    mockDeployExists.mockResolvedValue(true);
    mockWriteAlias.mockResolvedValue(undefined);

    await promote({ json: false, deployId: "20260412-100000-def5678" });

    expect(mockReadAlias).not.toHaveBeenCalled();
    expect(mockDeployExists).toHaveBeenCalledWith(
      expect.anything(),
      "test-bucket",
      "my-site",
      "20260412-100000-def5678",
    );
    expect(mockWriteAlias).toHaveBeenCalledWith(
      expect.anything(),
      "test-bucket",
      "my-site",
      "production",
      "20260412-100000-def5678",
    );
  });

  it("exits with EXIT_ALIAS when preview alias not set and no deploy-id", async () => {
    mockReadAlias.mockResolvedValue(null);

    await promote({ json: false });

    expect(mockExitWithCode).toHaveBeenCalledWith(
      EXIT_ALIAS,
      expect.any(String),
    );
    expect(mockWriteAlias).not.toHaveBeenCalled();
  });

  it("exits with EXIT_DEPLOY_NOT_FOUND when specified deploy does not exist", async () => {
    mockDeployExists.mockResolvedValue(false);

    await promote({ json: false, deployId: "20260412-100000-nonexist" });

    expect(mockExitWithCode).toHaveBeenCalledWith(
      EXIT_DEPLOY_NOT_FOUND,
      expect.any(String),
    );
    expect(mockWriteAlias).not.toHaveBeenCalled();
  });

  it("outputs JSON when --json flag is set", async () => {
    mockReadAlias.mockResolvedValue("20260413-120000-abc1234");
    mockDeployExists.mockResolvedValue(true);
    mockWriteAlias.mockResolvedValue(undefined);

    await promote({ json: true });

    expect(mockOutputSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ json: true, command: "promote" }),
      expect.any(String),
      expect.objectContaining({ deployId: "20260413-120000-abc1234" }),
    );
  });

  it("follows the pipeline: loadConfig -> resolveCredentials -> createS3Client", async () => {
    mockReadAlias.mockResolvedValue("20260413-120000-abc1234");
    mockDeployExists.mockResolvedValue(true);
    mockWriteAlias.mockResolvedValue(undefined);

    await promote({ json: false });

    expect(mockLoadConfig).toHaveBeenCalled();
    expect(mockResolveCredentials).toHaveBeenCalled();
    expect(mockCreateS3Client).toHaveBeenCalled();
  });
});
