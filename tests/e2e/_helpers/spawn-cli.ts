import { execFile, spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

const REPO_ROOT = resolve(process.cwd());
const BIN_PATH = resolve(REPO_ROOT, "dist", "index.js");

/**
 * Build dist/index.js exactly once per worker process. Cached promise
 * dedups concurrent callers within the same vitest worker. Across
 * workers the dist may be rebuilt redundantly — acceptable cost; tsup
 * writes atomically per-file so concurrent rebuilds don't corrupt
 * output.
 */
let buildPromise: Promise<void> | null = null;

async function ensureBinaryBuilt(): Promise<void> {
  if (buildPromise) return buildPromise;
  buildPromise = (async () => {
    try {
      await stat(BIN_PATH);
      return;
    } catch {
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
): Promise<RunBinaryResult> {
  await ensureBinaryBuilt();
  return new Promise<RunBinaryResult>((resolveP, reject) => {
    const child = spawn("node", [BIN_PATH, ...args], {
      env,
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
