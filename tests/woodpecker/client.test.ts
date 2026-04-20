import { describe, it, expect, vi } from "vitest";
import { WoodpeckerClient } from "../../src/woodpecker/client.js";
import { WoodpeckerError } from "../../src/woodpecker/errors.js";

function mockResponse(body: BodyInit | null, init: ResponseInit): Response {
  return new Response(body, init);
}

describe("WoodpeckerClient.createPipeline", () => {
  it("POSTs to /api/repos/{id}/pipelines with Bearer auth and JSON body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse(
        JSON.stringify({
          number: 42,
          status: "pending",
          created: 1,
          commit: "abc",
          branch: "main",
        }),
        { status: 200 },
      ),
    );
    const client = new WoodpeckerClient("https://wp.example", "tok", fetchMock);

    const pipeline = await client.createPipeline(10, {
      branch: "main",
      variables: { OP: "deploy" },
    });

    expect(pipeline.number).toBe(42);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://wp.example/api/repos/10/pipelines");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({
      branch: "main",
      variables: { OP: "deploy" },
    });
  });

  it("defaults variables to empty object", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse(
        JSON.stringify({
          number: 1,
          status: "pending",
          created: 0,
          commit: "x",
          branch: "main",
        }),
        { status: 200 },
      ),
    );
    const client = new WoodpeckerClient("https://wp.example", "t", fetchMock);
    await client.createPipeline(1, { branch: "main" });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      branch: "main",
      variables: {},
    });
  });

  it("throws WoodpeckerError with status and body on non-2xx", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockResponse("unauthorized", { status: 401 }));
    const client = new WoodpeckerClient("https://wp.example", "bad", fetchMock);
    try {
      await client.createPipeline(10, { branch: "main" });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(WoodpeckerError);
      const e = err as WoodpeckerError;
      expect(e.status).toBe(401);
      expect(e.body).toBe("unauthorized");
      expect(e.message).toMatch(/401/);
    }
  });
});

describe("WoodpeckerClient.getPipeline", () => {
  it("GETs /api/repos/{id}/pipelines/{n} with Bearer auth", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse(
        JSON.stringify({
          number: 7,
          status: "success",
          created: 2,
          commit: "c",
          branch: "main",
        }),
        { status: 200 },
      ),
    );
    const client = new WoodpeckerClient("https://wp.example", "t", fetchMock);
    const p = await client.getPipeline(10, 7);
    expect(p.number).toBe(7);
    expect(p.status).toBe("success");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://wp.example/api/repos/10/pipelines/7");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer t",
    );
  });

  it("throws WoodpeckerError on non-2xx", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockResponse("not found", { status: 404 }));
    const client = new WoodpeckerClient("https://wp.example", "t", fetchMock);
    await expect(client.getPipeline(1, 1)).rejects.toThrow(WoodpeckerError);
  });
});

describe("WoodpeckerClient.streamLogs (SSE)", () => {
  function sseStream(chunks: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        for (const c of chunks) controller.enqueue(encoder.encode(c));
        controller.close();
      },
    });
  }

  it("yields parsed LogLine for each data event", async () => {
    const stream = sseStream([
      'data: {"ts":1,"message":"hello"}\n\n',
      'data: {"ts":2,"message":"world"}\n\n',
    ]);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(stream, { status: 200 }));
    const client = new WoodpeckerClient("https://wp.example", "t", fetchMock);

    const lines = [];
    for await (const line of client.streamLogs(10, 42, 1)) lines.push(line);

    expect(lines).toEqual([
      { ts: 1, message: "hello" },
      { ts: 2, message: "world" },
    ]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://wp.example/api/stream/logs/10/42/1");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer t",
    );
  });

  it("handles events split across chunks", async () => {
    const stream = sseStream([
      'data: {"ts":1,',
      '"message":"split"}\n',
      "\n",
      'data: {"ts":2,"message":"ok"}\n\n',
    ]);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(stream, { status: 200 }));
    const client = new WoodpeckerClient("https://wp.example", "t", fetchMock);

    const lines = [];
    for await (const line of client.streamLogs(1, 1, 1)) lines.push(line);

    expect(lines).toEqual([
      { ts: 1, message: "split" },
      { ts: 2, message: "ok" },
    ]);
  });

  it("ignores non-data SSE lines", async () => {
    const stream = sseStream([
      ": comment\n",
      'event: log\ndata: {"ts":3,"message":"x"}\n\n',
    ]);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(stream, { status: 200 }));
    const client = new WoodpeckerClient("https://wp.example", "t", fetchMock);

    const lines = [];
    for await (const line of client.streamLogs(1, 1, 1)) lines.push(line);
    expect(lines).toEqual([{ ts: 3, message: "x" }]);
  });

  it("returns cleanly when the stream closes mid-buffer with no trailing \\n\\n", async () => {
    const stream = sseStream(['data: {"ts":1,"message":"a"}\n\n', "partial"]);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(stream, { status: 200 }));
    const client = new WoodpeckerClient("https://wp.example", "t", fetchMock);

    const lines = [];
    for await (const line of client.streamLogs(1, 1, 1)) lines.push(line);
    expect(lines).toEqual([{ ts: 1, message: "a" }]);
  });

  it("throws WoodpeckerError if the HTTP response is non-2xx", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockResponse("forbidden", { status: 403 }));
    const client = new WoodpeckerClient("https://wp.example", "t", fetchMock);
    await expect(async () => {
      for await (const _ of client.streamLogs(1, 1, 1)) {
        // drain
      }
    }).rejects.toThrow(WoodpeckerError);
  });

  it("handles CRLF-delimited SSE frames", async () => {
    const stream = sseStream([
      'data: {"ts":1,"message":"crlf"}\r\n\r\n',
      'data: {"ts":2,"message":"lf"}\n\n',
    ]);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(stream, { status: 200 }));
    const client = new WoodpeckerClient("https://wp.example", "t", fetchMock);
    const lines = [];
    for await (const line of client.streamLogs(1, 1, 1)) lines.push(line);
    expect(lines).toEqual([
      { ts: 1, message: "crlf" },
      { ts: 2, message: "lf" },
    ]);
  });

  it("accepts data frames without a space after the colon", async () => {
    const stream = sseStream(['data:{"ts":1,"message":"tight"}\n\n']);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(stream, { status: 200 }));
    const client = new WoodpeckerClient("https://wp.example", "t", fetchMock);
    const lines = [];
    for await (const line of client.streamLogs(1, 1, 1)) lines.push(line);
    expect(lines).toEqual([{ ts: 1, message: "tight" }]);
  });

  it("skips malformed JSON frames without throwing", async () => {
    const stream = sseStream([
      "data: {not-json}\n\n",
      'data: {"ts":2,"message":"after"}\n\n',
    ]);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(stream, { status: 200 }));
    const client = new WoodpeckerClient("https://wp.example", "t", fetchMock);
    const lines = [];
    for await (const line of client.streamLogs(1, 1, 1)) lines.push(line);
    expect(lines).toEqual([{ ts: 2, message: "after" }]);
  });
});

describe("WoodpeckerClient endpoint normalization", () => {
  it("strips trailing slash from endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          number: 1,
          status: "pending",
          created: 0,
          commit: "x",
          branch: "main",
        }),
        { status: 200 },
      ),
    );
    const client = new WoodpeckerClient("https://wp.example/", "t", fetchMock);
    await client.createPipeline(1, { branch: "main" });
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://wp.example/api/repos/1/pipelines");
  });
});
