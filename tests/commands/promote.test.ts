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
import { promote } from "../../src/commands/promote.js";
import { CredentialError, PipelineError } from "../../src/errors.js";
import { WoodpeckerError } from "../../src/woodpecker/errors.js";

const mockLoadConfig = vi.mocked(loadConfig);
const mockResolveToken = vi.mocked(resolveWoodpeckerToken);
const mockGetGitState = vi.mocked(getGitState);
const mockWoodpeckerClient = vi.mocked(WoodpeckerClient);
const mockStreamLogs = vi.mocked(streamFirstStepLogs);
const mockOutputSuccess = vi.mocked(outputSuccess);

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
    hash: "abc",
    branch: "main",
    dirty: false,
  });
  createPipelineMock = vi.fn().mockResolvedValue({
    number: 7,
    status: "pending",
    created: 0,
    commit: "c",
    branch: "main",
  });
  mockWoodpeckerClient.mockImplementation(
    () =>
      ({ createPipeline: createPipelineMock }) as unknown as WoodpeckerClient,
  );
  mockStreamLogs.mockResolvedValue(undefined);
});

describe("promote (Woodpecker)", () => {
  it("creates a pipeline with OP=promote on current branch", async () => {
    await promote({ json: false, follow: false });
    expect(createPipelineMock).toHaveBeenCalledWith(10, {
      branch: "main",
      variables: { OP: "promote" },
    });
  });

  it("falls back to 'main' when git branch is null", async () => {
    mockGetGitState.mockReturnValue({
      hash: null,
      branch: null,
      dirty: false,
    });
    await promote({ json: false, follow: false });
    expect(createPipelineMock).toHaveBeenCalledWith(10, {
      branch: "main",
      variables: { OP: "promote" },
    });
  });

  it("throws CredentialError when token missing", async () => {
    mockResolveToken.mockImplementation(() => {
      throw new CredentialError("no token");
    });
    await expect(promote({ json: false, follow: false })).rejects.toThrow(
      CredentialError,
    );
  });

  it("wraps WoodpeckerError as PipelineError", async () => {
    createPipelineMock.mockRejectedValue(new WoodpeckerError("500", 500));
    await expect(promote({ json: false, follow: false })).rejects.toThrow(
      PipelineError,
    );
  });

  it("outputs pipelineNumber, site, productionUrl", async () => {
    await promote({ json: true, follow: false });
    expect(mockOutputSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ command: "promote" }),
      expect.any(String),
      expect.objectContaining({
        pipelineNumber: 7,
        site: "my-site",
        productionUrl: "https://my-site.freecode.camp",
      }),
    );
  });

  it("streams logs only when follow=true", async () => {
    await promote({ json: false, follow: false });
    expect(mockStreamLogs).not.toHaveBeenCalled();
    await promote({ json: false, follow: true });
    expect(mockStreamLogs).toHaveBeenCalled();
  });
});
