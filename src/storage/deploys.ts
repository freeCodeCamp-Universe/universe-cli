import { S3Client } from "@aws-sdk/client-s3";
import { listObjects } from "./operations.js";

export async function listDeploys(
  client: S3Client,
  bucket: string,
  site: string,
): Promise<string[]> {
  const prefix = `${site}/deploys/`;
  const items = await listObjects(client, { bucket, prefix });

  const deployIds = new Set<string>();
  for (const item of items) {
    const afterPrefix = item.key.slice(prefix.length);
    const segment = afterPrefix.split("/")[0];
    if (segment) {
      deployIds.add(segment);
    }
  }

  return [...deployIds].sort().reverse();
}

export async function deployExists(
  client: S3Client,
  bucket: string,
  site: string,
  deployId: string,
): Promise<boolean> {
  const prefix = `${site}/deploys/${deployId}/`;
  const items = await listObjects(client, { bucket, prefix });
  return items.length > 0;
}
