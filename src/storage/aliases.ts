import { S3Client } from "@aws-sdk/client-s3";
import { getObject, putObject } from "./operations.js";

export async function readAlias(
  client: S3Client,
  bucket: string,
  site: string,
  aliasName: string,
): Promise<string | null> {
  const result = await getObject(client, {
    bucket,
    key: `${site}/${aliasName}`,
  });

  return result !== null ? result.trim() : null;
}

export async function writeAlias(
  client: S3Client,
  bucket: string,
  site: string,
  aliasName: string,
  deployId: string,
): Promise<void> {
  await putObject(client, {
    bucket,
    key: `${site}/${aliasName}`,
    body: deployId,
    contentType: "text/plain",
  });
}
