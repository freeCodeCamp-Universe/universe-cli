import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mockClient } from "aws-sdk-client-mock";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  uploadDirectory,
  getContentType,
  getCacheControl,
} from "../../src/deploy/upload.js";

const s3Mock = mockClient(S3Client);

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "upload-test-"));
}

beforeEach(() => {
  s3Mock.reset();
  s3Mock.on(PutObjectCommand).resolves({});
});

describe("getContentType", () => {
  it("returns text/html for .html files", () => {
    expect(getContentType("index.html")).toBe("text/html");
  });

  it("returns text/css for .css files", () => {
    expect(getContentType("style.css")).toBe("text/css");
  });

  it("returns text/javascript for .js files", () => {
    expect(getContentType("app.js")).toBe("text/javascript");
  });

  it("returns application/octet-stream for unknown extensions", () => {
    expect(getContentType("file.xyz123notreal")).toBe(
      "application/octet-stream",
    );
  });

  it("returns image/svg+xml for .svg files", () => {
    expect(getContentType("icon.svg")).toBe("image/svg+xml");
  });

  it("returns font/woff2 for .woff2 files", () => {
    expect(getContentType("font.woff2")).toBe("font/woff2");
  });

  it("returns application/manifest+json for .webmanifest files", () => {
    expect(getContentType("site.webmanifest")).toBe(
      "application/manifest+json",
    );
  });
});

describe("getCacheControl", () => {
  it("returns must-revalidate for .html files", () => {
    expect(getCacheControl("index.html")).toBe(
      "public, max-age=60, must-revalidate",
    );
  });

  it("returns immutable for Vite-fingerprinted JS files", () => {
    expect(getCacheControl("index-BjK3iFQp.js")).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  it("returns immutable for Vite-fingerprinted CSS files", () => {
    expect(getCacheControl("style-D4mK2x_1.css")).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  it("returns immutable for webpack-hashed files", () => {
    expect(getCacheControl("main.abc12345.js")).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  it("returns default cache for non-fingerprinted files", () => {
    expect(getCacheControl("robots.txt")).toBe("public, max-age=3600");
  });

  it("returns default cache for short-hash files (under 8 chars)", () => {
    expect(getCacheControl("main.ab12.js")).toBe("public, max-age=3600");
  });

  it("HTML takes precedence over fingerprint pattern", () => {
    expect(getCacheControl("page-BjK3iFQp.html")).toBe(
      "public, max-age=60, must-revalidate",
    );
  });
});

describe("uploadDirectory", () => {
  it("uploads all files from output directory", async () => {
    const dir = makeTmpDir();
    writeFileSync(join(dir, "index.html"), "<html></html>");
    writeFileSync(join(dir, "style.css"), "body{}");

    const client = new S3Client({});
    const result = await uploadDirectory(
      client,
      "test-bucket",
      "my-site",
      "20260413-120000-abc1234",
      dir,
    );

    expect(result.fileCount).toBe(2);
    expect(result.errors).toEqual([]);
    expect(s3Mock).toHaveReceivedCommandTimes(PutObjectCommand, 2);
  });

  it("uploads files in nested subdirectories", async () => {
    const dir = makeTmpDir();
    mkdirSync(join(dir, "assets"), { recursive: true });
    writeFileSync(join(dir, "index.html"), "<html></html>");
    writeFileSync(join(dir, "assets", "app.js"), "console.log()");

    const client = new S3Client({});
    const result = await uploadDirectory(
      client,
      "test-bucket",
      "my-site",
      "deploy-1",
      dir,
    );

    expect(result.fileCount).toBe(2);
    expect(result.errors).toEqual([]);
  });

  it("uses correct S3 key format: {site}/deploys/{deployId}/{path}", async () => {
    const dir = makeTmpDir();
    mkdirSync(join(dir, "assets"), { recursive: true });
    writeFileSync(join(dir, "assets", "app.js"), "console.log()");

    const client = new S3Client({});
    await uploadDirectory(client, "test-bucket", "my-site", "deploy-1", dir);

    expect(s3Mock).toHaveReceivedCommandWith(PutObjectCommand, {
      Bucket: "test-bucket",
      Key: "my-site/deploys/deploy-1/assets/app.js",
      ContentType: "text/javascript",
    });
  });

  it("sets correct Content-Type for uploaded files", async () => {
    const dir = makeTmpDir();
    writeFileSync(join(dir, "index.html"), "<html></html>");

    const client = new S3Client({});
    await uploadDirectory(client, "test-bucket", "my-site", "deploy-1", dir);

    expect(s3Mock).toHaveReceivedCommandWith(PutObjectCommand, {
      ContentType: "text/html",
    });
  });

  it("sets correct Cache-Control for HTML files", async () => {
    const dir = makeTmpDir();
    writeFileSync(join(dir, "index.html"), "<html></html>");

    const client = new S3Client({});
    await uploadDirectory(client, "test-bucket", "my-site", "deploy-1", dir);

    expect(s3Mock).toHaveReceivedCommandWith(PutObjectCommand, {
      CacheControl: "public, max-age=60, must-revalidate",
    });
  });

  it("sets immutable Cache-Control for fingerprinted assets", async () => {
    const dir = makeTmpDir();
    writeFileSync(join(dir, "index-BjK3iFQp.js"), "code");

    const client = new S3Client({});
    await uploadDirectory(client, "test-bucket", "my-site", "deploy-1", dir);

    expect(s3Mock).toHaveReceivedCommandWith(PutObjectCommand, {
      CacheControl: "public, max-age=31536000, immutable",
    });
  });

  it("returns total size of all uploaded files", async () => {
    const dir = makeTmpDir();
    const content1 = "<html></html>";
    const content2 = "body{}";
    writeFileSync(join(dir, "index.html"), content1);
    writeFileSync(join(dir, "style.css"), content2);

    const client = new S3Client({});
    const result = await uploadDirectory(
      client,
      "test-bucket",
      "my-site",
      "deploy-1",
      dir,
    );

    expect(result.totalSize).toBe(
      Buffer.byteLength(content1) + Buffer.byteLength(content2),
    );
  });

  it("collects errors instead of throwing on individual file failures", async () => {
    const dir = makeTmpDir();
    writeFileSync(join(dir, "good.html"), "<html></html>");
    writeFileSync(join(dir, "bad.css"), "body{}");

    s3Mock.on(PutObjectCommand).callsFake((input) => {
      if ((input.Key as string).endsWith("bad.css")) {
        throw new Error("Upload failed");
      }
      return {};
    });

    const client = new S3Client({});
    const result = await uploadDirectory(
      client,
      "test-bucket",
      "my-site",
      "deploy-1",
      dir,
    );

    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain("bad.css");
  });
});
