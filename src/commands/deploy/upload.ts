import { readFile as defaultReadFile } from "node:fs/promises";
import type { ProxyClient } from "../../platform/proxy-client.port.js";

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

interface UploadFileEntry {
  relPath: string;
  absPath: string;
}

interface UploadFilesOptions {
  client: Pick<ProxyClient, "deployUpload">;
  deployId: string;
  jwt: string;
  files: readonly UploadFileEntry[];
  concurrency?: number;
  onProgress?: (progress: { uploaded: number; total: number; current: string }) => void;
}

interface UploadFilesDeps {
  readFile?: (path: string) => Promise<Buffer>;
}

interface UploadFilesResult {
  fileCount: number;
  totalSize: number;
  uploaded: string[];
  errors: string[];
}

const DEFAULT_CONCURRENCY = 6;

/**
 * Static-site MIME map. Hand-rolled to eliminate a runtime dep used for
 * ~30 well-known extensions. Keys are extension lowercase WITHOUT leading dot.
 */
const MIME_BY_EXT: Readonly<Record<string, string>> = Object.freeze({
  avif: "image/avif",
  bmp: "image/bmp",
  cjs: "text/javascript",
  css: "text/css",
  csv: "text/csv",
  eot: "application/vnd.ms-fontobject",
  gif: "image/gif",
  htm: "text/html",
  html: "text/html",
  ico: "image/x-icon",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  js: "text/javascript",
  json: "application/json",
  md: "text/markdown",
  mjs: "text/javascript",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  ogg: "audio/ogg",
  otf: "font/otf",
  pdf: "application/pdf",
  png: "image/png",
  svg: "image/svg+xml",
  ttf: "font/ttf",
  txt: "text/plain",
  wasm: "application/wasm",
  wav: "audio/wav",
  webm: "video/webm",
  webp: "image/webp",
  woff: "font/woff",
  woff2: "font/woff2",
  xml: "application/xml",
});

const getContentType = (filename: string): string => {
  const dot = filename.lastIndexOf(".");
  if (dot < 0 || dot === filename.length - 1) {
    return "application/octet-stream";
  }
  const ext = filename.slice(dot + 1).toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
};

/**
 * Fixed-size async semaphore. Replaces `p-limit` — same surface
 * (`limit(fn) → Promise<T>`) without the dep. Tasks queue on a wait
 * list; a slot opens when an in-flight task settles.
 */
const createLimit = (max: number): (<T>(fn: () => Promise<T>) => Promise<T>) => {
  let active = 0;
  const queue: (() => void)[] = [];
  const acquire = (): Promise<void> => {
    if (active < max) {
      active += 1;
      return Promise.resolve();
    }
    // eslint-disable-next-line promise/avoid-new
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
    if (next) {
      next();
    }
  };
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    await acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  };
};

const uploadFiles = async (
  options: UploadFilesOptions,
  deps: UploadFilesDeps = {},
): Promise<UploadFilesResult> => {
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
        // Through unknown to bridge the type worlds.
        const bodyAsBodyInit = body as unknown as BodyInit;
        await options.client.deployUpload({
          body: bodyAsBodyInit,
          contentType: getContentType(file.relPath),
          deployId: options.deployId,
          jwt: options.jwt,
          path: file.relPath,
        });
        uploaded.push(file.relPath);
        totalSize += body.byteLength;
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown upload error";
        errors.push(`${file.relPath}: ${message}`);
      } finally {
        done += 1;
        if (options.onProgress) {
          options.onProgress({ current: file.relPath, total, uploaded: done });
        }
      }
    }),
  );

  await Promise.all(tasks);

  return { errors, fileCount: uploaded.length, totalSize, uploaded };
};

export {
  getContentType,
  uploadFiles,
  type UploadFileEntry,
  type UploadFilesDeps,
  type UploadFilesOptions,
  type UploadFilesResult,
};
