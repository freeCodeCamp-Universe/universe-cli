import { readFileSync } from "node:fs";
import { extname, basename } from "node:path";
import { S3Client } from "@aws-sdk/client-s3";
import { glob } from "tinyglobby";
import { lookup } from "mrmime";
import pLimit from "p-limit";
import { putObject } from "../storage/operations.js";

const FINGERPRINT_RE = /[.-][a-zA-Z0-9_-]{8,}\./;

export interface UploadResult {
  fileCount: number;
  totalSize: number;
  errors: string[];
}

export interface UploadOptions {
  concurrency?: number;
}

export function getContentType(filename: string): string {
  const mime = lookup(filename);
  if (mime === undefined) {
    console.warn(`Unknown content-type for extension: ${extname(filename)}`);
    return "application/octet-stream";
  }
  return mime;
}

export function getCacheControl(filename: string): string {
  if (extname(filename) === ".html") {
    return "public, max-age=60, must-revalidate";
  }
  if (FINGERPRINT_RE.test(basename(filename))) {
    return "public, max-age=31536000, immutable";
  }
  return "public, max-age=3600";
}

export async function uploadDirectory(
  client: S3Client,
  bucket: string,
  site: string,
  deployId: string,
  outputDir: string,
  options?: UploadOptions,
): Promise<UploadResult> {
  const concurrency = options?.concurrency ?? 10;
  const limit = pLimit(concurrency);

  const files = await glob(["**/*"], {
    cwd: outputDir,
    onlyFiles: true,
    absolute: false,
    followSymbolicLinks: false,
  });

  const errors: string[] = [];
  let totalSize = 0;
  let fileCount = 0;

  const tasks = files.map((filePath) =>
    limit(async () => {
      const fullPath = `${outputDir}/${filePath}`;
      const key = `${site}/deploys/${deployId}/${filePath}`;
      const contentType = getContentType(filePath);
      const cacheControl = getCacheControl(filePath);

      try {
        const body = readFileSync(fullPath);
        totalSize += body.byteLength;
        fileCount++;

        await putObject(client, {
          bucket,
          key,
          body,
          contentType,
          cacheControl,
        });
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "unknown upload error";
        errors.push(`${filePath}: ${message}`);
      }
    }),
  );

  await Promise.all(tasks);

  return { fileCount, totalSize, errors };
}
