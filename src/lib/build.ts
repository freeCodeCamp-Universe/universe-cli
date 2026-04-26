import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { ConfigError } from "../errors.js";

/**
 * Build orchestrator for `universe static deploy`.
 *
 * The CLI itself does not understand bundlers — it just runs whatever
 * `platform.yaml` `build.command` shells out and then verifies that the
 * declared `build.output` directory exists. If `build.command` is unset
 * the deploy is treated as pre-built (CI artifact pattern).
 *
 * The shell exec is injected so tests don't actually spawn processes.
 */

export interface RunBuildOptions {
  command: string | undefined;
  cwd: string;
  outputDir: string;
}

export interface RunBuildResult {
  skipped: boolean;
  outputDir: string;
}

export interface RunBuildDeps {
  exec?: (req: { command: string; cwd: string }) => Promise<number>;
}

const defaultExec = async (req: {
  command: string;
  cwd: string;
}): Promise<number> => {
  return new Promise<number>((resolveExit, reject) => {
    const child = spawn(req.command, {
      cwd: req.cwd,
      shell: true,
      stdio: "inherit",
    });
    child.on("error", (err) => reject(err));
    child.on("exit", (code) => resolveExit(code ?? 1));
  });
};

async function ensureDirectory(absPath: string): Promise<void> {
  let st;
  try {
    st = await stat(absPath);
  } catch {
    throw new ConfigError(`output directory missing after build: ${absPath}`);
  }
  if (!st.isDirectory()) {
    throw new ConfigError(
      `output path is not a directory after build: ${absPath}`,
    );
  }
}

export async function runBuild(
  options: RunBuildOptions,
  deps: RunBuildDeps = {},
): Promise<RunBuildResult> {
  const exec = deps.exec ?? defaultExec;
  const absCwd = isAbsolute(options.cwd) ? options.cwd : resolve(options.cwd);
  const absOutput = isAbsolute(options.outputDir)
    ? options.outputDir
    : resolve(absCwd, options.outputDir);

  if (!options.command) {
    await ensureDirectory(absOutput);
    return { skipped: true, outputDir: absOutput };
  }

  const code = await exec({ command: options.command, cwd: absCwd });
  if (code !== 0) {
    throw new ConfigError(
      `build command failed with exit code ${code}: ${options.command}`,
    );
  }
  await ensureDirectory(absOutput);
  return { skipped: false, outputDir: absOutput };
}
