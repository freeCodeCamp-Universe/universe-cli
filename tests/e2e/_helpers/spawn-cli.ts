import { spawn } from "node:child_process";
import { resolve } from "node:path";

const BIN_PATH = resolve(process.cwd(), "dist", "index.cjs");

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
