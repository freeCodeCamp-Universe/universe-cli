import { describe, it, expect } from "vitest";
import { S3Client } from "@aws-sdk/client-s3";
import { createS3Client } from "../../src/storage/client.js";

describe("createS3Client", () => {
  it("returns an S3Client instance", () => {
    const client = createS3Client({
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
      endpoint: "https://example.r2.cloudflarestorage.com",
    });

    expect(client).toBeInstanceOf(S3Client);
  });

  it("configures forcePathStyle to true for R2 compatibility", async () => {
    const client = createS3Client({
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
      endpoint: "https://example.r2.cloudflarestorage.com",
    });

    const config = client.config;
    const forcePathStyle = await config.forcePathStyle;
    expect(forcePathStyle).toBe(true);
  });

  it("uses the provided endpoint", async () => {
    const endpoint = "https://my-account.r2.cloudflarestorage.com";
    const client = createS3Client({
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
      endpoint,
    });

    const resolved = await client.config.endpoint();
    expect(resolved.hostname).toBe("my-account.r2.cloudflarestorage.com");
  });

  it("defaults region to auto when not provided", async () => {
    const client = createS3Client({
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
      endpoint: "https://example.r2.cloudflarestorage.com",
    });

    const region = await client.config.region();
    expect(region).toBe("auto");
  });

  it("uses provided region when specified", async () => {
    const client = createS3Client({
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
      endpoint: "https://example.r2.cloudflarestorage.com",
      region: "us-east-1",
    });

    const region = await client.config.region();
    expect(region).toBe("us-east-1");
  });
});
