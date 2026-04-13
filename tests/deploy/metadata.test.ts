import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  writeDeployMetadata,
  type DeployMetadata,
} from "../../src/deploy/metadata.js";

const s3Mock = mockClient(S3Client);

beforeEach(() => {
  s3Mock.reset();
  s3Mock.on(PutObjectCommand).resolves({});
});

describe("writeDeployMetadata", () => {
  it("writes JSON to the correct S3 key", async () => {
    const client = new S3Client({});
    const meta: DeployMetadata = {
      deployId: "20260413-120000-abc1234",
      timestamp: "2026-04-13T12:00:00.000Z",
      gitHash: "abc1234def5678",
      gitDirty: false,
      fileCount: 5,
      totalSize: 1024,
    };

    await writeDeployMetadata(
      client,
      "test-bucket",
      "my-site",
      "20260413-120000-abc1234",
      meta,
    );

    expect(s3Mock).toHaveReceivedCommandWith(PutObjectCommand, {
      Bucket: "test-bucket",
      Key: "my-site/_universe/deploys/20260413-120000-abc1234.json",
      ContentType: "application/json",
    });
  });

  it("writes all required fields in the JSON body", async () => {
    const client = new S3Client({});
    const meta: DeployMetadata = {
      deployId: "20260413-120000-abc1234",
      timestamp: "2026-04-13T12:00:00.000Z",
      gitHash: "abc1234def5678",
      gitDirty: false,
      fileCount: 5,
      totalSize: 1024,
    };

    await writeDeployMetadata(
      client,
      "test-bucket",
      "my-site",
      "20260413-120000-abc1234",
      meta,
    );

    const call = s3Mock.commandCalls(PutObjectCommand)[0];
    const body = JSON.parse(call.args[0].input.Body as string) as Record<
      string,
      unknown
    >;

    expect(body).toEqual({
      deployId: "20260413-120000-abc1234",
      timestamp: "2026-04-13T12:00:00.000Z",
      gitHash: "abc1234def5678",
      gitDirty: false,
      fileCount: 5,
      totalSize: 1024,
    });
  });

  it("supports null gitHash", async () => {
    const client = new S3Client({});
    const meta: DeployMetadata = {
      deployId: "20260413-120000-nogit",
      timestamp: "2026-04-13T12:00:00.000Z",
      gitHash: null,
      gitDirty: false,
      fileCount: 3,
      totalSize: 512,
    };

    await writeDeployMetadata(
      client,
      "test-bucket",
      "my-site",
      "20260413-120000-nogit",
      meta,
    );

    const call = s3Mock.commandCalls(PutObjectCommand)[0];
    const body = JSON.parse(call.args[0].input.Body as string) as Record<
      string,
      unknown
    >;

    expect(body.gitHash).toBeNull();
  });
});
