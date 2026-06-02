import { execFile, spawn } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

const REPO_ROOT = resolve(process.cwd());
const BIN_PATH = resolve(REPO_ROOT, "dist", "index.cjs");
const SRC_DIR = resolve(REPO_ROOT, "src");

/**
 * Build dist/index.cjs exactly once per worker process. Cached promise
 * dedups concurrent callers within the same vitest worker. Across
 * workers the dist may be rebuilt redundantly — acceptable cost; tsdown
 * writes atomically per-file so concurrent rebuilds don't corrupt
 * output.
 *
 * Staleness rule: rebuild when dist/index.cjs is missing OR any file
 * under src/ is newer than dist/index.cjs. Without this, edits to a
 * command handler land in src/ but the binary smoke continues running
 * the prior build — silent false negatives.
 */
let buildPromise: Promise<void> | null = null;

async function maxMtime(dir: string): Promise<number> {
  let max = 0;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const child = await maxMtime(full);
      if (child > max) max = child;
    } else if (entry.isFile()) {
      const s = await stat(full);
      if (s.mtimeMs > max) max = s.mtimeMs;
    }
  }
  return max;
}

async function ensureBinaryBuilt(): Promise<void> {
  if (buildPromise) return buildPromise;
  buildPromise = (async () => {
    let binMtime = -1;
    try {
      binMtime = (await stat(BIN_PATH)).mtimeMs;
    } catch {
      binMtime = -1;
    }
    const srcMtime = await maxMtime(SRC_DIR);
    if (binMtime < 0 || srcMtime > binMtime) {
      await execFileP("pnpm", ["build"], {
        cwd: REPO_ROOT,
        timeout: 120_000,
      });
    }
  })();
  return buildPromise;
}

export interface RunBinaryResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function runBinary(
  args: string[],
  env: NodeJS.ProcessEnv,
  cwd?: string,
): Promise<RunBinaryResult> {
  await ensureBinaryBuilt();
  return new Promise<RunBinaryResult>((resolveP, reject) => {
    const child = spawn("node", [BIN_PATH, ...args], {
      env,
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout.on("data", (c: Buffer) => stdoutChunks.push(c));
    child.stderr.on("data", (c: Buffer) => stderrChunks.push(c));
    child.on("error", reject);
    child.on("close", (code) => {
      resolveP({
        stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
        stderr: Buffer.concat(stderrChunks).toString("utf-8"),
        exitCode: code ?? 0,
      });
    });
  });
}
