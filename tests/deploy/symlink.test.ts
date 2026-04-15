import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { S3Client } from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { PutObjectCommand } from "@aws-sdk/client-s3";

import { uploadDirectory } from "../../src/deploy/upload.js";
import { StorageError } from "../../src/errors.js";

const s3Mock = mockClient(S3Client);

describe("upload — symlink exfiltration guard", () => {
  let root: string;
  let outputDir: string;
  let escapeDir: string;

  beforeEach(() => {
    s3Mock.reset();
    s3Mock.on(PutObjectCommand).resolves({});
    root = mkdtempSync(join(tmpdir(), "universe-cli-symlink-"));
    outputDir = join(root, "dist");
    escapeDir = join(root, "escape");
    mkdirSync(outputDir, { recursive: true });
    mkdirSync(escapeDir, { recursive: true });
    writeFileSync(join(outputDir, "safe.html"), "<html></html>");
    writeFileSync(join(escapeDir, "secret.txt"), "SECRET_DO_NOT_UPLOAD");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("rejects symlinked directory whose target escapes outputDir", async () => {
    symlinkSync(escapeDir, join(outputDir, "linked"));

    const client = new S3Client({ region: "auto" });
    await expect(
      uploadDirectory(client, "bucket", "site", "deploy-1", outputDir),
    ).rejects.toThrow(StorageError);
    const putCalls = s3Mock.commandCalls(PutObjectCommand);
    expect(putCalls.length).toBe(0);
  });

  it("rejects symlinked file whose target escapes outputDir", async () => {
    symlinkSync(join(escapeDir, "secret.txt"), join(outputDir, "leaky"));

    const client = new S3Client({ region: "auto" });
    await expect(
      uploadDirectory(client, "bucket", "site", "deploy-1", outputDir),
    ).rejects.toThrow(StorageError);
    const putCalls = s3Mock.commandCalls(PutObjectCommand);
    expect(putCalls.some((c) => c.args[0].input.Key?.includes("secret"))).toBe(
      false,
    );
  });

  it("allows intra-project symlinks that resolve inside outputDir", async () => {
    const inner = join(outputDir, "inner");
    mkdirSync(inner);
    writeFileSync(join(inner, "asset.js"), "console.log('x')");
    symlinkSync(inner, join(outputDir, "linked"));

    const client = new S3Client({ region: "auto" });
    const result = await uploadDirectory(
      client,
      "bucket",
      "site",
      "deploy-1",
      outputDir,
    );
    expect(result.errors).toEqual([]);
    expect(result.fileCount).toBeGreaterThan(0);
  });

  it("uploads files normally when no symlinks are present", async () => {
    const client = new S3Client({ region: "auto" });
    const result = await uploadDirectory(
      client,
      "bucket",
      "site",
      "deploy-1",
      outputDir,
    );
    expect(result.errors).toEqual([]);
    expect(result.fileCount).toBe(1);
  });
});
