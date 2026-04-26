import { describe, expect, it, vi } from "vitest";
import { uploadFiles } from "../../src/lib/upload.js";
import type { ProxyClient } from "../../src/lib/proxy-client.js";

function mkClient(
  upload: ProxyClient["deployUpload"] = vi
    .fn()
    .mockResolvedValue({ received: "x", key: "k" }),
): { client: ProxyClient; upload: ReturnType<typeof vi.fn> } {
  const fn = upload as ReturnType<typeof vi.fn>;
  return {
    client: {
      whoami: vi.fn(),
      deployInit: vi.fn(),
      deployUpload: fn,
      deployFinalize: vi.fn(),
      siteDeploys: vi.fn(),
      sitePromote: vi.fn(),
      siteRollback: vi.fn(),
    },
    upload: fn,
  };
}

describe("uploadFiles", () => {
  it("uploads each file via client.deployUpload", async () => {
    const { client, upload } = mkClient();
    const readFile = vi
      .fn()
      .mockImplementation(async (path: string) =>
        Buffer.from(`bytes-of-${path}`),
      );

    const r = await uploadFiles(
      {
        client,
        deployId: "d1",
        jwt: "jwt1",
        files: [
          { relPath: "index.html", absPath: "/abs/index.html" },
          { relPath: "main.js", absPath: "/abs/main.js" },
        ],
        concurrency: 1,
      },
      { readFile },
    );

    expect(upload).toHaveBeenCalledTimes(2);
    expect(r.fileCount).toBe(2);
    expect(r.errors).toEqual([]);
    expect(r.uploaded).toEqual(["index.html", "main.js"]);
  });

  it("forwards deployId and jwt to each upload", async () => {
    const { client, upload } = mkClient();
    const readFile = vi.fn().mockResolvedValue(Buffer.from("x"));

    await uploadFiles(
      {
        client,
        deployId: "d_abc",
        jwt: "jwt_xyz",
        files: [{ relPath: "a.html", absPath: "/abs/a.html" }],
      },
      { readFile },
    );

    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({
        deployId: "d_abc",
        jwt: "jwt_xyz",
        path: "a.html",
      }),
    );
  });

  it("detects content-type from file extension", async () => {
    const { client, upload } = mkClient();
    const readFile = vi.fn().mockResolvedValue(Buffer.from("x"));

    await uploadFiles(
      {
        client,
        deployId: "d",
        jwt: "j",
        files: [
          { relPath: "index.html", absPath: "/a/index.html" },
          { relPath: "main.css", absPath: "/a/main.css" },
          { relPath: "icon.svg", absPath: "/a/icon.svg" },
        ],
      },
      { readFile },
    );

    const types = upload.mock.calls.map(
      (c: unknown[]) => (c[0] as { contentType: string }).contentType,
    );
    expect(types).toEqual(["text/html", "text/css", "image/svg+xml"]);
  });

  it("falls back to application/octet-stream for unknown extensions", async () => {
    const { client, upload } = mkClient();
    const readFile = vi.fn().mockResolvedValue(Buffer.from("x"));

    await uploadFiles(
      {
        client,
        deployId: "d",
        jwt: "j",
        files: [{ relPath: "weird.xyz123notreal", absPath: "/a/weird" }],
      },
      { readFile },
    );

    const arg = upload.mock.calls[0]?.[0] as { contentType: string };
    expect(arg.contentType).toBe("application/octet-stream");
  });

  it("passes file body to upload as bytes", async () => {
    const { client, upload } = mkClient();
    const readFile = vi
      .fn()
      .mockImplementation(async () => Buffer.from("hello"));

    await uploadFiles(
      {
        client,
        deployId: "d",
        jwt: "j",
        files: [{ relPath: "x.txt", absPath: "/a/x.txt" }],
      },
      { readFile },
    );

    const arg = upload.mock.calls[0]?.[0] as { body: Buffer };
    expect(Buffer.from(arg.body).toString("utf-8")).toBe("hello");
  });

  it("aggregates total size", async () => {
    const { client } = mkClient();
    const readFile = vi
      .fn()
      .mockImplementationOnce(async () => Buffer.alloc(100))
      .mockImplementationOnce(async () => Buffer.alloc(250));

    const r = await uploadFiles(
      {
        client,
        deployId: "d",
        jwt: "j",
        files: [
          { relPath: "a", absPath: "/x/a" },
          { relPath: "b", absPath: "/x/b" },
        ],
      },
      { readFile },
    );

    expect(r.totalSize).toBe(350);
  });

  it("surfaces per-file errors without aborting the rest", async () => {
    const upload = vi
      .fn()
      .mockResolvedValueOnce({ received: "a", key: "k1" })
      .mockRejectedValueOnce(new Error("upload failed"))
      .mockResolvedValueOnce({ received: "c", key: "k3" });
    const { client } = mkClient(
      upload as unknown as ProxyClient["deployUpload"],
    );
    const readFile = vi.fn().mockResolvedValue(Buffer.from("x"));

    const r = await uploadFiles(
      {
        client,
        deployId: "d",
        jwt: "j",
        files: [
          { relPath: "a", absPath: "/x/a" },
          { relPath: "b", absPath: "/x/b" },
          { relPath: "c", absPath: "/x/c" },
        ],
        concurrency: 1,
      },
      { readFile },
    );

    expect(r.fileCount).toBe(2);
    expect(r.errors).toEqual(["b: upload failed"]);
    expect(r.uploaded).toEqual(["a", "c"]);
  });

  it("invokes onProgress for each file", async () => {
    const { client } = mkClient();
    const readFile = vi.fn().mockResolvedValue(Buffer.from("x"));
    const onProgress = vi.fn();

    await uploadFiles(
      {
        client,
        deployId: "d",
        jwt: "j",
        files: [
          { relPath: "a", absPath: "/x/a" },
          { relPath: "b", absPath: "/x/b" },
        ],
        concurrency: 1,
        onProgress,
      },
      { readFile },
    );

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ uploaded: 2, total: 2 }),
    );
  });

  it("respects concurrency limit", async () => {
    let active = 0;
    let peak = 0;
    const upload = vi.fn().mockImplementation(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return { received: "x", key: "k" };
    });
    const { client } = mkClient(upload as ProxyClient["deployUpload"]);
    const readFile = vi.fn().mockResolvedValue(Buffer.from("x"));

    await uploadFiles(
      {
        client,
        deployId: "d",
        jwt: "j",
        files: Array.from({ length: 8 }, (_, i) => ({
          relPath: `f${i}`,
          absPath: `/x/f${i}`,
        })),
        concurrency: 3,
      },
      { readFile },
    );

    expect(peak).toBeLessThanOrEqual(3);
  });
});
