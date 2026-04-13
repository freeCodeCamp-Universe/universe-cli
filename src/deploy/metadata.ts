import { S3Client } from "@aws-sdk/client-s3";
import { putObject } from "../storage/operations.js";

export interface DeployMetadata {
  deployId: string;
  timestamp: string;
  gitHash: string | null;
  gitDirty: boolean;
  fileCount: number;
  totalSize: number;
}

export async function writeDeployMetadata(
  client: S3Client,
  bucket: string,
  site: string,
  deployId: string,
  meta: DeployMetadata,
): Promise<void> {
  const key = `${site}/_universe/deploys/${deployId}.json`;
  const body = JSON.stringify(meta);

  await putObject(client, {
    bucket,
    key,
    body,
    contentType: "application/json",
  });
}
