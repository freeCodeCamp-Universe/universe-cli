import { readFile as defaultReadFile } from "node:fs/promises";
import { lookup } from "mrmime";
import pLimit from "p-limit";
import type { ProxyClient } from "./proxy-client.js";

/**
 * Sequential per-file upload to the artemis proxy with a small
 * concurrency cap. Each file is sent as a single
 * `PUT /api/deploy/{deployId}/upload?path=<rel>` request whose body is
 * the raw bytes — no multipart envelope, no presigned URLs.
 *
 * Error policy: per-file failures are collected into `result.errors[]`
 * so the caller can decide whether to fail the whole deploy or surface
 * a partial-success report. The proxy will refuse to finalize a deploy
 * whose expected file list does not surface in R2 anyway, so the CLI
 * does not need to abort on the first error.
 */

export interface UploadFileEntry {
  relPath: string;
  absPath: string;
}

export interface UploadFilesOptions {
  client: Pick<ProxyClient, "deployUpload">;
  deployId: string;
  jwt: string;
  files: readonly UploadFileEntry[];
  concurrency?: number;
  onProgress?: (progress: {
    uploaded: number;
    total: number;
    current: string;
  }) => void;
}

export interface UploadFilesDeps {
  readFile?: (path: string) => Promise<Buffer>;
}

export interface UploadFilesResult {
  fileCount: number;
  totalSize: number;
  uploaded: string[];
  errors: string[];
}

const DEFAULT_CONCURRENCY = 6;

export function getContentType(filename: string): string {
  return lookup(filename) ?? "application/octet-stream";
}

export async function uploadFiles(
  options: UploadFilesOptions,
  deps: UploadFilesDeps = {},
): Promise<UploadFilesResult> {
  const read = deps.readFile ?? defaultReadFile;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const limit = pLimit(concurrency);
  const total = options.files.length;

  const uploaded: string[] = [];
  const errors: string[] = [];
  let totalSize = 0;
  let done = 0;

  const tasks = options.files.map((file) =>
    limit(async () => {
      try {
        const body = await read(file.absPath);
        // @types/node Buffer is `Buffer<ArrayBufferLike>` while lib.dom
        // BodyInit reaches for global Uint8Array. The two type worlds
        // agree at runtime — fetch accepts Buffer just fine — but the
        // structural check sees the union member URLSearchParams and
        // bails. Cast through unknown to BodyInit to bridge.
        const bodyAsBodyInit = body as unknown as BodyInit;
        await options.client.deployUpload({
          deployId: options.deployId,
          jwt: options.jwt,
          path: file.relPath,
          body: bodyAsBodyInit,
          contentType: getContentType(file.relPath),
        });
        uploaded.push(file.relPath);
        totalSize += body.byteLength;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "unknown upload error";
        errors.push(`${file.relPath}: ${message}`);
      } finally {
        done += 1;
        if (options.onProgress) {
          options.onProgress({
            uploaded: done,
            total,
            current: file.relPath,
          });
        }
      }
    }),
  );

  await Promise.all(tasks);

  return {
    fileCount: uploaded.length,
    totalSize,
    uploaded,
    errors,
  };
}
