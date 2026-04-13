import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { sdkStreamMixin } from "@smithy/util-stream";
import { Readable } from "node:stream";
import {
  putObject,
  getObject,
  listObjects,
  headObject,
  deleteObject,
  deleteObjects,
} from "../../src/storage/operations.js";

const s3Mock = mockClient(S3Client);

beforeEach(() => {
  s3Mock.reset();
});

describe("putObject", () => {
  it("sends PutObjectCommand with correct parameters", async () => {
    s3Mock.on(PutObjectCommand).resolves({});

    const client = new S3Client({});
    await putObject(client, {
      bucket: "test-bucket",
      key: "site/deploys/abc/index.html",
      body: Buffer.from("<html></html>"),
      contentType: "text/html",
      cacheControl: "public, max-age=60",
    });

    expect(s3Mock).toHaveReceivedCommandWith(PutObjectCommand, {
      Bucket: "test-bucket",
      Key: "site/deploys/abc/index.html",
      Body: Buffer.from("<html></html>"),
      ContentType: "text/html",
      CacheControl: "public, max-age=60",
    });
  });

  it("accepts string body", async () => {
    s3Mock.on(PutObjectCommand).resolves({});

    const client = new S3Client({});
    await putObject(client, {
      bucket: "test-bucket",
      key: "site/preview",
      body: "20260413-120000-abc1234",
      contentType: "text/plain",
    });

    expect(s3Mock).toHaveReceivedCommandWith(PutObjectCommand, {
      Bucket: "test-bucket",
      Key: "site/preview",
      Body: "20260413-120000-abc1234",
      ContentType: "text/plain",
    });
  });
});

describe("getObject", () => {
  it("sends GetObjectCommand and returns body as string", async () => {
    const stream = sdkStreamMixin(
      Readable.from([Buffer.from("file-contents")]),
    );
    s3Mock.on(GetObjectCommand).resolves({ Body: stream });

    const client = new S3Client({});
    const result = await getObject(client, {
      bucket: "test-bucket",
      key: "site/preview",
    });

    expect(result).toBe("file-contents");
    expect(s3Mock).toHaveReceivedCommandWith(GetObjectCommand, {
      Bucket: "test-bucket",
      Key: "site/preview",
    });
  });

  it("returns null when object does not exist (NoSuchKey)", async () => {
    const error = new Error("NoSuchKey");
    error.name = "NoSuchKey";
    s3Mock.on(GetObjectCommand).rejects(error);

    const client = new S3Client({});
    const result = await getObject(client, {
      bucket: "test-bucket",
      key: "nonexistent",
    });

    expect(result).toBeNull();
  });
});

describe("listObjects", () => {
  it("sends ListObjectsV2Command with prefix and returns items", async () => {
    s3Mock.on(ListObjectsV2Command).resolves({
      Contents: [
        {
          Key: "site/deploys/abc/index.html",
          Size: 1234,
          LastModified: new Date("2026-04-13T12:00:00Z"),
        },
        {
          Key: "site/deploys/abc/style.css",
          Size: 567,
          LastModified: new Date("2026-04-13T12:00:01Z"),
        },
      ],
    });

    const client = new S3Client({});
    const result = await listObjects(client, {
      bucket: "test-bucket",
      prefix: "site/deploys/abc/",
    });

    expect(result).toEqual([
      {
        key: "site/deploys/abc/index.html",
        size: 1234,
        lastModified: new Date("2026-04-13T12:00:00Z"),
      },
      {
        key: "site/deploys/abc/style.css",
        size: 567,
        lastModified: new Date("2026-04-13T12:00:01Z"),
      },
    ]);

    expect(s3Mock).toHaveReceivedCommandWith(ListObjectsV2Command, {
      Bucket: "test-bucket",
      Prefix: "site/deploys/abc/",
    });
  });

  it("paginates when response is truncated", async () => {
    s3Mock
      .on(ListObjectsV2Command)
      .resolvesOnce({
        Contents: [
          {
            Key: "site/deploys/abc/page1.html",
            Size: 100,
            LastModified: new Date("2026-04-13T12:00:00Z"),
          },
        ],
        IsTruncated: true,
        NextContinuationToken: "token-abc",
      })
      .resolvesOnce({
        Contents: [
          {
            Key: "site/deploys/abc/page2.html",
            Size: 200,
            LastModified: new Date("2026-04-13T12:00:01Z"),
          },
        ],
        IsTruncated: false,
      });

    const client = new S3Client({});
    const result = await listObjects(client, {
      bucket: "test-bucket",
      prefix: "site/deploys/abc/",
    });

    expect(result).toEqual([
      {
        key: "site/deploys/abc/page1.html",
        size: 100,
        lastModified: new Date("2026-04-13T12:00:00Z"),
      },
      {
        key: "site/deploys/abc/page2.html",
        size: 200,
        lastModified: new Date("2026-04-13T12:00:01Z"),
      },
    ]);

    expect(s3Mock).toHaveReceivedCommandTimes(ListObjectsV2Command, 2);
  });

  it("returns empty array when no contents", async () => {
    s3Mock.on(ListObjectsV2Command).resolves({ Contents: undefined });

    const client = new S3Client({});
    const result = await listObjects(client, {
      bucket: "test-bucket",
      prefix: "empty/",
    });

    expect(result).toEqual([]);
  });
});

describe("headObject", () => {
  it("sends HeadObjectCommand and returns metadata", async () => {
    s3Mock.on(HeadObjectCommand).resolves({
      ContentLength: 1024,
      ContentType: "text/html",
      LastModified: new Date("2026-04-13T12:00:00Z"),
    });

    const client = new S3Client({});
    const result = await headObject(client, {
      bucket: "test-bucket",
      key: "site/deploys/abc/index.html",
    });

    expect(result).toEqual({
      contentLength: 1024,
      contentType: "text/html",
      lastModified: new Date("2026-04-13T12:00:00Z"),
    });
  });

  it("returns null when object does not exist (NotFound)", async () => {
    const error = new Error("NotFound");
    error.name = "NotFound";
    s3Mock.on(HeadObjectCommand).rejects(error);

    const client = new S3Client({});
    const result = await headObject(client, {
      bucket: "test-bucket",
      key: "nonexistent",
    });

    expect(result).toBeNull();
  });
});

describe("deleteObject", () => {
  it("sends DeleteObjectCommand with correct parameters", async () => {
    s3Mock.on(DeleteObjectCommand).resolves({});

    const client = new S3Client({});
    await deleteObject(client, {
      bucket: "test-bucket",
      key: "site/deploys/old/file.js",
    });

    expect(s3Mock).toHaveReceivedCommandWith(DeleteObjectCommand, {
      Bucket: "test-bucket",
      Key: "site/deploys/old/file.js",
    });
  });
});

describe("deleteObjects", () => {
  it("sends DeleteObjectsCommand with correct keys", async () => {
    s3Mock
      .on(DeleteObjectsCommand)
      .resolves({ Deleted: [{ Key: "a" }, { Key: "b" }] });

    const client = new S3Client({});
    const result = await deleteObjects(client, {
      bucket: "test-bucket",
      keys: ["a", "b"],
    });

    expect(result).toEqual({ deleted: ["a", "b"] });
    expect(s3Mock).toHaveReceivedCommandWith(DeleteObjectsCommand, {
      Bucket: "test-bucket",
      Delete: {
        Objects: [{ Key: "a" }, { Key: "b" }],
      },
    });
  });
});

describe("retry behavior", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries on 5xx errors up to max retries", async () => {
    const serverError = Object.assign(new Error("InternalError"), {
      name: "InternalError",
      $metadata: { httpStatusCode: 500 },
    });

    s3Mock
      .on(HeadObjectCommand)
      .rejectsOnce(serverError)
      .rejectsOnce(serverError)
      .resolves({
        ContentLength: 100,
        ContentType: "text/plain",
        LastModified: new Date("2026-04-13T12:00:00Z"),
      });

    const client = new S3Client({});
    const promise = headObject(client, {
      bucket: "test-bucket",
      key: "site/file.txt",
    });

    await vi.advanceTimersByTimeAsync(10_000);
    const result = await promise;

    expect(result).toEqual({
      contentLength: 100,
      contentType: "text/plain",
      lastModified: new Date("2026-04-13T12:00:00Z"),
    });
    expect(s3Mock).toHaveReceivedCommandTimes(HeadObjectCommand, 3);
  });

  it("throws after exhausting all retries", async () => {
    const serverError = Object.assign(new Error("InternalError"), {
      name: "InternalError",
      $metadata: { httpStatusCode: 500 },
    });

    s3Mock.on(HeadObjectCommand).rejects(serverError);

    const client = new S3Client({});
    const promise = headObject(client, {
      bucket: "test-bucket",
      key: "site/file.txt",
    });

    const rejection = expect(promise).rejects.toThrow("InternalError");
    await vi.advanceTimersByTimeAsync(10_000);
    await rejection;

    expect(s3Mock).toHaveReceivedCommandTimes(HeadObjectCommand, 4);
  });

  it("does not retry on non-transient errors (4xx)", async () => {
    const clientError = Object.assign(new Error("AccessDenied"), {
      name: "AccessDenied",
      $metadata: { httpStatusCode: 403 },
    });

    s3Mock.on(PutObjectCommand).rejects(clientError);

    const client = new S3Client({});
    await expect(
      putObject(client, {
        bucket: "test-bucket",
        key: "site/file.txt",
        body: "data",
        contentType: "text/plain",
      }),
    ).rejects.toThrow("AccessDenied");

    expect(s3Mock).toHaveReceivedCommandTimes(PutObjectCommand, 1);
  });

  it("retries on throttling errors (429)", async () => {
    const throttleError = Object.assign(new Error("ThrottlingException"), {
      name: "ThrottlingException",
      $metadata: { httpStatusCode: 429 },
    });

    s3Mock.on(PutObjectCommand).rejectsOnce(throttleError).resolves({});

    const client = new S3Client({});
    const promise = putObject(client, {
      bucket: "test-bucket",
      key: "site/file.txt",
      body: "data",
      contentType: "text/plain",
    });

    await vi.advanceTimersByTimeAsync(10_000);
    await promise;

    expect(s3Mock).toHaveReceivedCommandTimes(PutObjectCommand, 2);
  });
});
