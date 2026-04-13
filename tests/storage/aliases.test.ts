import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { sdkStreamMixin } from "@smithy/util-stream";
import { Readable } from "node:stream";
import { readAlias, writeAlias } from "../../src/storage/aliases.js";

const s3Mock = mockClient(S3Client);

beforeEach(() => {
  s3Mock.reset();
});

describe("readAlias", () => {
  it("reads an alias file and returns the trimmed deploy ID", async () => {
    const stream = sdkStreamMixin(
      Readable.from([Buffer.from("20260413-120000-abc1234")]),
    );
    s3Mock.on(GetObjectCommand).resolves({ Body: stream });

    const client = new S3Client({});
    const result = await readAlias(client, "test-bucket", "my-site", "preview");

    expect(result).toBe("20260413-120000-abc1234");
    expect(s3Mock).toHaveReceivedCommandWith(GetObjectCommand, {
      Bucket: "test-bucket",
      Key: "my-site/preview",
    });
  });

  it("trims whitespace from the deploy ID", async () => {
    const stream = sdkStreamMixin(
      Readable.from([Buffer.from("  20260413-120000-abc1234  \n")]),
    );
    s3Mock.on(GetObjectCommand).resolves({ Body: stream });

    const client = new S3Client({});
    const result = await readAlias(
      client,
      "test-bucket",
      "my-site",
      "production",
    );

    expect(result).toBe("20260413-120000-abc1234");
  });

  it("returns null when the alias does not exist (NoSuchKey)", async () => {
    const error = new Error("NoSuchKey");
    error.name = "NoSuchKey";
    s3Mock.on(GetObjectCommand).rejects(error);

    const client = new S3Client({});
    const result = await readAlias(client, "test-bucket", "my-site", "preview");

    expect(result).toBeNull();
  });

  it("reads the production alias at the correct key path", async () => {
    const stream = sdkStreamMixin(
      Readable.from([Buffer.from("20260412-100000-def5678")]),
    );
    s3Mock.on(GetObjectCommand).resolves({ Body: stream });

    const client = new S3Client({});
    await readAlias(client, "test-bucket", "my-site", "production");

    expect(s3Mock).toHaveReceivedCommandWith(GetObjectCommand, {
      Bucket: "test-bucket",
      Key: "my-site/production",
    });
  });
});

describe("writeAlias", () => {
  it("writes a deploy ID to the alias file", async () => {
    s3Mock.on(PutObjectCommand).resolves({});

    const client = new S3Client({});
    await writeAlias(
      client,
      "test-bucket",
      "my-site",
      "preview",
      "20260413-120000-abc1234",
    );

    expect(s3Mock).toHaveReceivedCommandWith(PutObjectCommand, {
      Bucket: "test-bucket",
      Key: "my-site/preview",
      Body: "20260413-120000-abc1234",
      ContentType: "text/plain",
    });
  });

  it("writes to the production alias at the correct key path", async () => {
    s3Mock.on(PutObjectCommand).resolves({});

    const client = new S3Client({});
    await writeAlias(
      client,
      "test-bucket",
      "my-site",
      "production",
      "20260413-120000-abc1234",
    );

    expect(s3Mock).toHaveReceivedCommandWith(PutObjectCommand, {
      Bucket: "test-bucket",
      Key: "my-site/production",
      Body: "20260413-120000-abc1234",
      ContentType: "text/plain",
    });
  });
});
