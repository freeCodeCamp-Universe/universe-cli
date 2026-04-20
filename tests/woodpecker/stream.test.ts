import { describe, it, expect, vi } from "vitest";
import { streamFirstStepLogs } from "../../src/woodpecker/stream.js";
import { WoodpeckerClient } from "../../src/woodpecker/client.js";
import type { LogLine } from "../../src/woodpecker/types.js";

function makeClient(lines: LogLine[]): {
  client: WoodpeckerClient;
  streamMock: ReturnType<typeof vi.fn>;
} {
  const streamMock = vi.fn(async function* () {
    for (const l of lines) yield l;
  });
  const client = Object.create(
    WoodpeckerClient.prototype,
  ) as WoodpeckerClient & { streamLogs: typeof streamMock };
  client.streamLogs = streamMock;
  return { client, streamMock };
}

describe("streamFirstStepLogs", () => {
  it("writes each log line to stdout", async () => {
    const { client } = makeClient([
      { ts: 1, message: "hello" },
      { ts: 2, message: "world" },
    ]);
    const chunks: string[] = [];
    const writer = (chunk: string) => {
      chunks.push(chunk);
      return true;
    };

    await streamFirstStepLogs(client, 10, 42, { write: writer });

    expect(chunks.join("")).toContain("hello");
    expect(chunks.join("")).toContain("world");
  });

  it("invokes streamLogs with repoId, pipelineNumber, stepId=1", async () => {
    const { client, streamMock } = makeClient([]);
    await streamFirstStepLogs(client, 10, 42, {
      write: () => true,
    });
    expect(streamMock).toHaveBeenCalledWith(10, 42, 1);
  });
});
