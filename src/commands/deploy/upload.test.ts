import { setTimeout as sleep } from "node:timers/promises";
import type { ProxyClient } from "../../platform/proxy-client.port.js";
import { uploadFiles } from "./upload.js";

const mkClient = (
  upload: ProxyClient["deployUpload"] = vi.fn().mockResolvedValue({ key: "k", received: "x" }),
): { client: ProxyClient; upload: ReturnType<typeof vi.fn> } => {
  const fn = upload as ReturnType<typeof vi.fn>;
  return {
    client: {
      deployFinalize: vi.fn(),
      deployInit: vi.fn(),
      deployUpload: fn,
      siteDeploys: vi.fn(),
      sitePromote: vi.fn(),
      siteRollback: vi.fn(),
      whoami: vi.fn(),
    },
    upload: fn,
  };
};

describe(uploadFiles, () => {
  it("uploads each file via client.deployUpload", async () => {
    const { client, upload } = mkClient();
    const readFile = vi
      .fn()
      .mockImplementation((path: string) => Promise.resolve(Buffer.from(`bytes-of-${path}`)));
    const r = await uploadFiles(
      {
        client,
        concurrency: 1,
        deployId: "d1",
        files: [
          { absPath: "/abs/index.html", relPath: "index.html" },
          { absPath: "/abs/main.js", relPath: "main.js" },
        ],
        jwt: "jwt1",
      },
      { readFile },
    );
    expect(upload).toHaveBeenCalledTimes(2);
    expect(r.fileCount).toBe(2);
    expect(r.errors).toStrictEqual([]);
    expect(r.uploaded).toStrictEqual(["index.html", "main.js"]);
  });

  it("forwards deployId and jwt to each upload", async () => {
    const { client, upload } = mkClient();
    const readFile = vi.fn().mockResolvedValue(Buffer.from("x"));
    await uploadFiles(
      {
        client,
        deployId: "d_abc",
        files: [{ absPath: "/abs/a.html", relPath: "a.html" }],
        jwt: "jwt_xyz",
      },
      { readFile },
    );
    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({ deployId: "d_abc", jwt: "jwt_xyz", path: "a.html" }),
    );
  });

  it("detects content-type from file extension", async () => {
    const { client, upload } = mkClient();
    const readFile = vi.fn().mockResolvedValue(Buffer.from("x"));
    await uploadFiles(
      {
        client,
        deployId: "d",
        files: [
          { absPath: "/a/index.html", relPath: "index.html" },
          { absPath: "/a/main.css", relPath: "main.css" },
          { absPath: "/a/icon.svg", relPath: "icon.svg" },
        ],
        jwt: "j",
      },
      { readFile },
    );
    const types = upload.mock.calls.map(
      (c: unknown[]) => (c[0] as { contentType: string }).contentType,
    );
    expect(types).toStrictEqual(["text/html", "text/css", "image/svg+xml"]);
  });

  it("falls back to application/octet-stream for unknown extensions", async () => {
    const { client, upload } = mkClient();
    const readFile = vi.fn().mockResolvedValue(Buffer.from("x"));
    await uploadFiles(
      {
        client,
        deployId: "d",
        files: [{ absPath: "/a/weird", relPath: "weird.xyz123notreal" }],
        jwt: "j",
      },
      { readFile },
    );
    const arg = upload.mock.calls[0]?.[0] as { contentType: string };
    expect(arg.contentType).toBe("application/octet-stream");
  });

  it("passes file body to upload as bytes", async () => {
    const { client, upload } = mkClient();
    const readFile = vi.fn().mockResolvedValue(Buffer.from("hello"));
    await uploadFiles(
      {
        client,
        deployId: "d",
        files: [{ absPath: "/a/x.txt", relPath: "x.txt" }],
        jwt: "j",
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
      .mockResolvedValueOnce(Buffer.alloc(100))
      .mockResolvedValueOnce(Buffer.alloc(250));
    const r = await uploadFiles(
      {
        client,
        deployId: "d",
        files: [
          { absPath: "/x/a", relPath: "a" },
          { absPath: "/x/b", relPath: "b" },
        ],
        jwt: "j",
      },
      { readFile },
    );
    expect(r.totalSize).toBe(350);
  });

  it("surfaces per-file errors without aborting the rest", async () => {
    const upload = vi
      .fn()
      .mockResolvedValueOnce({ key: "k1", received: "a" })
      .mockRejectedValueOnce(new Error("upload failed"))
      .mockResolvedValueOnce({ key: "k3", received: "c" });
    const { client } = mkClient(upload as unknown as ProxyClient["deployUpload"]);
    const readFile = vi.fn().mockResolvedValue(Buffer.from("x"));
    const r = await uploadFiles(
      {
        client,
        concurrency: 1,
        deployId: "d",
        files: [
          { absPath: "/x/a", relPath: "a" },
          { absPath: "/x/b", relPath: "b" },
          { absPath: "/x/c", relPath: "c" },
        ],
        jwt: "j",
      },
      { readFile },
    );
    expect(r.fileCount).toBe(2);
    expect(r.errors).toStrictEqual(["b: upload failed"]);
    expect(r.uploaded).toStrictEqual(["a", "c"]);
  });

  it("invokes onProgress for each file", async () => {
    const { client } = mkClient();
    const readFile = vi.fn().mockResolvedValue(Buffer.from("x"));
    const onProgress = vi.fn();
    await uploadFiles(
      {
        client,
        concurrency: 1,
        deployId: "d",
        files: [
          { absPath: "/x/a", relPath: "a" },
          { absPath: "/x/b", relPath: "b" },
        ],
        jwt: "j",
        onProgress,
      },
      { readFile },
    );
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ total: 2, uploaded: 2 }));
  });

  it("respects concurrency limit", async () => {
    let active = 0;
    let peak = 0;
    const upload = vi.fn().mockImplementation(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await sleep(5);
      active -= 1;
      return { key: "k", received: "x" };
    });
    const { client } = mkClient(upload as ProxyClient["deployUpload"]);
    const readFile = vi.fn().mockResolvedValue(Buffer.from("x"));
    await uploadFiles(
      {
        client,
        concurrency: 3,
        deployId: "d",
        files: Array.from({ length: 8 }, (_, i) => ({
          absPath: `/x/f${i}`,
          relPath: `f${i}`,
        })),
        jwt: "j",
      },
      { readFile },
    );
    expect(peak).toBeLessThanOrEqual(3);
  });
});
