import { S3Client } from "@aws-sdk/client-s3";
import { type S3Credentials } from "../credentials/resolver.js";

export function createS3Client(credentials: S3Credentials): S3Client {
  return new S3Client({
    endpoint: credentials.endpoint,
    region: credentials.region ?? "auto",
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
    },
    forcePathStyle: true,
  });
}
