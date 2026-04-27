import { readFile as defaultReadFile } from "node:fs/promises";
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

/**
 * Static-site MIME map. Hand-rolled (replaces `mrmime` in v0.4 — F8)
 * to eliminate a runtime dep used for ~30 well-known extensions. Keys
 * are extension lowercase WITHOUT leading dot.
 */
const MIME_BY_EXT: Readonly<Record<string, string>> = Object.freeze({
  // text
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "text/javascript",
  mjs: "text/javascript",
  cjs: "text/javascript",
  json: "application/json",
  txt: "text/plain",
  md: "text/markdown",
  xml: "application/xml",
  csv: "text/csv",
  // images
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  bmp: "image/bmp",
  // fonts
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  eot: "application/vnd.ms-fontobject",
  // a/v
  mp4: "video/mp4",
  webm: "video/webm",
  ogg: "audio/ogg",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  // other
  pdf: "application/pdf",
  wasm: "application/wasm",
});

export function getContentType(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot < 0 || dot === filename.length - 1) {
    return "application/octet-stream";
  }
  const ext = filename.slice(dot + 1).toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

/**
 * Fixed-size async semaphore. Replaces `p-limit` (F8) — same surface
 * (`limit(fn) → Promise<T>`) without the dep. Tasks queue on a wait
 * list; a slot opens when an in-flight task settles.
 */
function createLimit(max: number): <T>(fn: () => Promise<T>) => Promise<T> {
  let active = 0;
  const queue: Array<() => void> = [];
  const acquire = (): Promise<void> => {
    if (active < max) {
      active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      queue.push(() => {
        active += 1;
        resolve();
      });
    });
  };
  const release = (): void => {
    active -= 1;
    const next = queue.shift();
    if (next) next();
  };
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    await acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  };
}

export async function uploadFiles(
  options: UploadFilesOptions,
  deps: UploadFilesDeps = {},
): Promise<UploadFilesResult> {
  const read = deps.readFile ?? defaultReadFile;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const limit = createLimit(concurrency);
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
        // BodyInit reaches for global Uint8Array. Runtime is fine; cast
        // through unknown to bridge the type worlds.
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
