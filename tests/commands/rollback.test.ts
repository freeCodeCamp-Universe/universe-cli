import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/config/loader.js", () => ({ loadConfig: vi.fn() }));
vi.mock("../../src/credentials/woodpecker.js", () => ({
  resolveWoodpeckerToken: vi.fn(),
}));
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
import { WoodpeckerClient } from "../../src/woodpecker/client.js";
import { streamFirstStepLogs } from "../../src/woodpecker/stream.js";
import { outputSuccess } from "../../src/output/format.js";
import { rollback } from "../../src/commands/rollback.js";
import {
  CredentialError,
  PipelineError,
  UsageError,
} from "../../src/errors.js";
import { WoodpeckerError } from "../../src/woodpecker/errors.js";

const mockLoadConfig = vi.mocked(loadConfig);
const mockResolveToken = vi.mocked(resolveWoodpeckerToken);
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
  createPipelineMock = vi.fn().mockResolvedValue({
    number: 9,
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

describe("rollback (Woodpecker)", () => {
  it("throws UsageError when --to is missing", async () => {
    await expect(rollback({ json: false, follow: false })).rejects.toThrow(
      UsageError,
    );
    expect(createPipelineMock).not.toHaveBeenCalled();
  });

  it("throws UsageError for malformed deploy-id (wrong date)", async () => {
    await expect(
      rollback({ json: false, follow: false, to: "not-a-deploy-id" }),
    ).rejects.toThrow(UsageError);
    expect(createPipelineMock).not.toHaveBeenCalled();
  });

  it("throws UsageError for deploy-id with wrong sha length", async () => {
    await expect(
      rollback({ json: false, follow: false, to: "20260413-120000-abcd" }),
    ).rejects.toThrow(UsageError);
  });

  it("accepts canonical deploy-id (YYYYMMDD-HHMMSS-<sha7>)", async () => {
    await rollback({
      json: false,
      follow: false,
      to: "20260413-120000-abc1234",
    });
    expect(createPipelineMock).toHaveBeenCalledWith(10, {
      branch: "main",
      variables: { OP: "rollback", ROLLBACK_TO: "20260413-120000-abc1234" },
    });
  });

  it("accepts dirty deploy-id (YYYYMMDD-HHMMSS-dirty-<hex8>)", async () => {
    await rollback({
      json: false,
      follow: false,
      to: "20260413-120000-dirty-0123abcd",
    });
    expect(createPipelineMock).toHaveBeenCalled();
  });

  it("throws CredentialError when token missing", async () => {
    mockResolveToken.mockImplementation(() => {
      throw new CredentialError("no token");
    });
    await expect(
      rollback({ json: false, follow: false, to: "20260413-120000-abc1234" }),
    ).rejects.toThrow(CredentialError);
  });

  it("wraps WoodpeckerError as PipelineError", async () => {
    createPipelineMock.mockRejectedValue(new WoodpeckerError("500", 500));
    await expect(
      rollback({ json: false, follow: false, to: "20260413-120000-abc1234" }),
    ).rejects.toThrow(PipelineError);
  });

  it("outputs pipelineNumber and rollbackTo", async () => {
    await rollback({
      json: true,
      follow: false,
      to: "20260413-120000-abc1234",
    });
    expect(mockOutputSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ command: "rollback" }),
      expect.any(String),
      expect.objectContaining({
        pipelineNumber: 9,
        rollbackTo: "20260413-120000-abc1234",
        site: "my-site",
      }),
    );
  });

  it("streams logs only when follow=true", async () => {
    await rollback({
      json: false,
      follow: false,
      to: "20260413-120000-abc1234",
    });
    expect(mockStreamLogs).not.toHaveBeenCalled();
    await rollback({
      json: false,
      follow: true,
      to: "20260413-120000-abc1234",
    });
    expect(mockStreamLogs).toHaveBeenCalled();
  });
});
