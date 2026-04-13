import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  S3Client,
  ListObjectsV2Command,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { listDeploys, deployExists } from "../../src/storage/deploys.js";

const s3Mock = mockClient(S3Client);

beforeEach(() => {
  s3Mock.reset();
});

describe("listDeploys", () => {
  it("returns deploy IDs sorted newest-first from object listing", async () => {
    s3Mock.on(ListObjectsV2Command).resolves({
      Contents: [
        {
          Key: "my-site/deploys/20260410-100000-aaa1111/index.html",
          Size: 100,
          LastModified: new Date(),
        },
        {
          Key: "my-site/deploys/20260412-120000-ccc3333/index.html",
          Size: 200,
          LastModified: new Date(),
        },
        {
          Key: "my-site/deploys/20260411-110000-bbb2222/style.css",
          Size: 50,
          LastModified: new Date(),
        },
        {
          Key: "my-site/deploys/20260412-120000-ccc3333/style.css",
          Size: 80,
          LastModified: new Date(),
        },
      ],
    });

    const client = new S3Client({});
    const result = await listDeploys(client, "test-bucket", "my-site");

    expect(result).toEqual([
      "20260412-120000-ccc3333",
      "20260411-110000-bbb2222",
      "20260410-100000-aaa1111",
    ]);
  });

  it("returns empty array when no deploys exist", async () => {
    s3Mock.on(ListObjectsV2Command).resolves({
      Contents: undefined,
    });

    const client = new S3Client({});
    const result = await listDeploys(client, "test-bucket", "my-site");

    expect(result).toEqual([]);
  });

  it("deduplicates deploy IDs from multiple objects", async () => {
    s3Mock.on(ListObjectsV2Command).resolves({
      Contents: [
        {
          Key: "my-site/deploys/20260413-090000-ddd4444/index.html",
          Size: 100,
          LastModified: new Date(),
        },
        {
          Key: "my-site/deploys/20260413-090000-ddd4444/style.css",
          Size: 50,
          LastModified: new Date(),
        },
        {
          Key: "my-site/deploys/20260413-090000-ddd4444/script.js",
          Size: 75,
          LastModified: new Date(),
        },
      ],
    });

    const client = new S3Client({});
    const result = await listDeploys(client, "test-bucket", "my-site");

    expect(result).toEqual(["20260413-090000-ddd4444"]);
  });

  it("uses the correct prefix for listing", async () => {
    s3Mock.on(ListObjectsV2Command).resolves({ Contents: [] });

    const client = new S3Client({});
    await listDeploys(client, "test-bucket", "my-site");

    expect(s3Mock).toHaveReceivedCommandWith(ListObjectsV2Command, {
      Bucket: "test-bucket",
      Prefix: "my-site/deploys/",
    });
  });
});

describe("deployExists", () => {
  it("returns true when deploy prefix has objects", async () => {
    s3Mock.on(ListObjectsV2Command).resolves({
      Contents: [
        {
          Key: "my-site/deploys/20260413-090000-ddd4444/index.html",
          Size: 100,
          LastModified: new Date(),
        },
      ],
    });

    const client = new S3Client({});
    const result = await deployExists(
      client,
      "test-bucket",
      "my-site",
      "20260413-090000-ddd4444",
    );

    expect(result).toBe(true);
  });

  it("returns false when deploy prefix has no objects", async () => {
    s3Mock.on(ListObjectsV2Command).resolves({
      Contents: undefined,
    });

    const client = new S3Client({});
    const result = await deployExists(
      client,
      "test-bucket",
      "my-site",
      "20260413-090000-nonexist",
    );

    expect(result).toBe(false);
  });

  it("uses the correct prefix for checking", async () => {
    s3Mock.on(ListObjectsV2Command).resolves({ Contents: [] });

    const client = new S3Client({});
    await deployExists(
      client,
      "test-bucket",
      "my-site",
      "20260413-090000-ddd4444",
    );

    expect(s3Mock).toHaveReceivedCommandWith(ListObjectsV2Command, {
      Bucket: "test-bucket",
      Prefix: "my-site/deploys/20260413-090000-ddd4444/",
    });
  });
});
