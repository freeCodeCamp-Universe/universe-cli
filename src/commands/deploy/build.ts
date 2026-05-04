import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { isAbsolute, resolve as resolvePath } from "node:path";
import { ConfigError } from "../../errors/cli-errors.js";

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

interface RunBuildOptions {
  command: string | undefined;
  cwd: string;
  outputDir: string;
}

interface RunBuildResult {
  skipped: boolean;
  outputDir: string;
}

interface RunBuildDeps {
  exec?: (req: { command: string; cwd: string }) => Promise<number>;
}

const defaultExec = (req: { command: string; cwd: string }): Promise<number> =>
  // eslint-disable-next-line promise/avoid-new
  new Promise<number>((resolve, reject) => {
    const child = spawn(req.command, {
      cwd: req.cwd,
      shell: true,
      stdio: "inherit",
    });
    child.on("error", (err) => {
      reject(err);
    });
    child.on("exit", (code) => {
      resolve(code ?? 1);
    });
  });

const ensureDirectory = async (absPath: string): Promise<void> => {
  let st;
  try {
    st = await stat(absPath);
  } catch {
    throw new ConfigError(`output directory missing after build: ${absPath}`);
  }
  if (!st.isDirectory()) {
    throw new ConfigError(`output path is not a directory after build: ${absPath}`);
  }
};

const runBuild = async (
  options: RunBuildOptions,
  deps: RunBuildDeps = {},
): Promise<RunBuildResult> => {
  const exec = deps.exec ?? defaultExec;
  const absCwd = isAbsolute(options.cwd) ? options.cwd : resolvePath(options.cwd);
  const absOutput = isAbsolute(options.outputDir)
    ? options.outputDir
    : resolvePath(absCwd, options.outputDir);

  if (options.command === undefined) {
    await ensureDirectory(absOutput);
    return { outputDir: absOutput, skipped: true };
  }

  const code = await exec({ command: options.command, cwd: absCwd });
  if (code !== 0) {
    throw new ConfigError(`build command failed with exit code ${code}: ${options.command}`);
  }
  await ensureDirectory(absOutput);
  return { outputDir: absOutput, skipped: false };
};

export { runBuild, type RunBuildDeps, type RunBuildOptions, type RunBuildResult };
