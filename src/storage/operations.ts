import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

interface PutObjectParams {
  bucket: string;
  key: string;
  body: Buffer | string;
  contentType: string;
  cacheControl?: string;
}

interface GetObjectParams {
  bucket: string;
  key: string;
}

interface ListObjectsParams {
  bucket: string;
  prefix: string;
}

interface HeadObjectParams {
  bucket: string;
  key: string;
}

interface DeleteObjectParams {
  bucket: string;
  key: string;
}

interface DeleteObjectsParams {
  bucket: string;
  keys: string[];
}

export interface ListObjectItem {
  key: string;
  size: number;
  lastModified: Date;
}

export interface HeadObjectResult {
  contentLength: number | undefined;
  contentType: string | undefined;
  lastModified: Date | undefined;
}

export interface DeleteObjectsResult {
  deleted: string[];
}

function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const meta = (error as unknown as Record<string, unknown>).$metadata as
    | { httpStatusCode?: number }
    | undefined;
  const statusCode = meta?.httpStatusCode;

  if (statusCode !== undefined && statusCode >= 500) return true;
  if (statusCode === 429) return true;

  const name = error.name;
  if (
    name === "ThrottlingException" ||
    name === "TooManyRequestsException" ||
    name === "RequestTimeout" ||
    name === "RequestTimeoutException"
  )
    return true;

  if (
    name === "NetworkingError" ||
    name === "TimeoutError" ||
    (error as { code?: string }).code === "ECONNRESET"
  )
    return true;

  return false;
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      if (!isTransientError(error) || attempt === MAX_RETRIES) {
        throw error;
      }
      const jitter = Math.random() * BASE_DELAY_MS;
      const delay = BASE_DELAY_MS * Math.pow(2, attempt) + jitter;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("withRetry: unreachable");
}

export async function putObject(
  client: S3Client,
  params: PutObjectParams,
): Promise<void> {
  await withRetry(() =>
    client.send(
      new PutObjectCommand({
        Bucket: params.bucket,
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType,
        CacheControl: params.cacheControl,
      }),
    ),
  );
}

export async function getObject(
  client: S3Client,
  params: GetObjectParams,
): Promise<string | null> {
  try {
    const response = await withRetry(() =>
      client.send(
        new GetObjectCommand({
          Bucket: params.bucket,
          Key: params.key,
        }),
      ),
    );
    return (await response.Body?.transformToString()) ?? null;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "NoSuchKey") {
      return null;
    }
    throw error;
  }
}

export async function listObjects(
  client: S3Client,
  params: ListObjectsParams,
): Promise<ListObjectItem[]> {
  const allItems: ListObjectItem[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await withRetry(() =>
      client.send(
        new ListObjectsV2Command({
          Bucket: params.bucket,
          Prefix: params.prefix,
          ContinuationToken: continuationToken,
        }),
      ),
    );

    if (response.Contents) {
      for (const item of response.Contents) {
        allItems.push({
          key: item.Key ?? "",
          size: item.Size ?? 0,
          lastModified: item.LastModified ?? new Date(0),
        });
      }
    }

    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return allItems;
}

export async function headObject(
  client: S3Client,
  params: HeadObjectParams,
): Promise<HeadObjectResult | null> {
  try {
    const response = await withRetry(() =>
      client.send(
        new HeadObjectCommand({
          Bucket: params.bucket,
          Key: params.key,
        }),
      ),
    );
    return {
      contentLength: response.ContentLength,
      contentType: response.ContentType,
      lastModified: response.LastModified,
    };
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error.name === "NotFound" || error.name === "NoSuchKey")
    ) {
      return null;
    }
    throw error;
  }
}

export async function deleteObject(
  client: S3Client,
  params: DeleteObjectParams,
): Promise<void> {
  await withRetry(() =>
    client.send(
      new DeleteObjectCommand({
        Bucket: params.bucket,
        Key: params.key,
      }),
    ),
  );
}

export async function deleteObjects(
  client: S3Client,
  params: DeleteObjectsParams,
): Promise<DeleteObjectsResult> {
  const response = await withRetry(() =>
    client.send(
      new DeleteObjectsCommand({
        Bucket: params.bucket,
        Delete: {
          Objects: params.keys.map((key) => ({ Key: key })),
        },
      }),
    ),
  );

  return {
    deleted: (response.Deleted ?? []).map((d) => d.Key ?? ""),
  };
}
