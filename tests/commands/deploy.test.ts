import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/config/loader.js", () => ({ loadConfig: vi.fn() }));
vi.mock("../../src/credentials/woodpecker.js", () => ({
  resolveWoodpeckerToken: vi.fn(),
}));
vi.mock("../../src/deploy/git.js", () => ({ getGitState: vi.fn() }));
vi.mock("../../src/woodpecker/client.js", () => ({
  WoodpeckerClient: vi.fn(),
}));
vi.mock("../../src/woodpecker/stream.js", () => ({
  streamFirstStepLogs: vi.fn(),
}));
vi.mock("../../src/output/format.js", () => ({
  outputSuccess: vi.fn(),
  outputError: vi.fn(),
}));

import { loadConfig } from "../../src/config/loader.js";
import { resolveWoodpeckerToken } from "../../src/credentials/woodpecker.js";
import { getGitState } from "../../src/deploy/git.js";
import { WoodpeckerClient } from "../../src/woodpecker/client.js";
import { streamFirstStepLogs } from "../../src/woodpecker/stream.js";
import { outputSuccess } from "../../src/output/format.js";
import { deploy } from "../../src/commands/deploy.js";
import { CredentialError, GitError, PipelineError } from "../../src/errors.js";
import { WoodpeckerError } from "../../src/woodpecker/errors.js";

const mockLoadConfig = vi.mocked(loadConfig);
const mockResolveToken = vi.mocked(resolveWoodpeckerToken);
const mockGetGitState = vi.mocked(getGitState);
const mockWoodpeckerClient = vi.mocked(WoodpeckerClient);
const mockStreamLogs = vi.mocked(streamFirstStepLogs);
const mockOutputSuccess = vi.mocked(outputSuccess);

function pipelineStub() {
  return {
    number: 42,
    status: "pending" as const,
    created: 0,
    commit: "abc",
    branch: "main",
  };
}

let createPipelineMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadConfig.mockReturnValue({
    name: "my-site",
    stack: "static",
    domain: {
      production: "my-site.freecode.camp",
      preview: "my-site--preview.freecode.camp",
    },
    static: {
      output_dir: "dist",
    },
    woodpecker: { endpoint: "https://wp.example", repo_id: 10 },
  });
  mockResolveToken.mockReturnValue("tok");
  mockGetGitState.mockReturnValue({
    hash: "abc1234",
    branch: "main",
    dirty: false,
  });
  createPipelineMock = vi.fn().mockResolvedValue(pipelineStub());
  mockWoodpeckerClient.mockImplementation(
    () =>
      ({ createPipeline: createPipelineMock }) as unknown as WoodpeckerClient,
  );
  mockStreamLogs.mockResolvedValue(undefined);
});

describe("deploy (Woodpecker)", () => {
  it("creates a pipeline with OP=deploy + DEPLOY_TARGET=preview on the current branch", async () => {
    await deploy({ json: false, follow: false });

    expect(mockWoodpeckerClient).toHaveBeenCalledWith(
      "https://wp.example",
      "tok",
    );
    expect(createPipelineMock).toHaveBeenCalledWith(10, {
      branch: "main",
      variables: { OP: "deploy", DEPLOY_TARGET: "preview" },
    });
  });

  it("uses --branch override when provided", async () => {
    await deploy({ json: false, follow: false, branch: "feature-x" });
    expect(createPipelineMock).toHaveBeenCalledWith(10, {
      branch: "feature-x",
      variables: { OP: "deploy", DEPLOY_TARGET: "preview" },
    });
  });

  it("throws CredentialError when WOODPECKER_TOKEN is missing", async () => {
    mockResolveToken.mockImplementation(() => {
      throw new CredentialError("WOODPECKER_TOKEN not set. …");
    });
    await expect(deploy({ json: false, follow: false })).rejects.toThrow(
      CredentialError,
    );
    expect(createPipelineMock).not.toHaveBeenCalled();
  });

  it("throws GitError when git working tree is dirty", async () => {
    mockGetGitState.mockReturnValue({
      hash: "abc",
      branch: "main",
      dirty: true,
    });
    await expect(deploy({ json: false, follow: false })).rejects.toThrow(
      GitError,
    );
    expect(createPipelineMock).not.toHaveBeenCalled();
  });

  it("throws GitError when not in a git repo", async () => {
    mockGetGitState.mockReturnValue({
      hash: null,
      branch: null,
      dirty: false,
    });
    await expect(deploy({ json: false, follow: false })).rejects.toThrow(
      GitError,
    );
  });

  it("wraps WoodpeckerError as PipelineError", async () => {
    createPipelineMock.mockRejectedValue(new WoodpeckerError("bad", 500));
    await expect(deploy({ json: false, follow: false })).rejects.toThrow(
      PipelineError,
    );
  });

  it("does not stream logs when follow=false", async () => {
    await deploy({ json: false, follow: false });
    expect(mockStreamLogs).not.toHaveBeenCalled();
  });

  it("streams logs when follow=true", async () => {
    await deploy({ json: false, follow: true });
    expect(mockStreamLogs).toHaveBeenCalledWith(expect.any(Object), 10, 42);
  });

  it("outputs pipelineNumber, site, previewUrl, branch", async () => {
    await deploy({ json: true, follow: false });
    expect(mockOutputSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ json: true, command: "deploy" }),
      expect.any(String),
      expect.objectContaining({
        pipelineNumber: 42,
        site: "my-site",
        previewUrl: expect.stringContaining("my-site--preview.freecode.camp"),
        branch: "main",
      }),
    );
  });
});
