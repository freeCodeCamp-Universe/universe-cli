import { execFile } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

const REPO_ROOT = resolve(process.cwd());
const BIN_PATH = resolve(REPO_ROOT, "dist", "index.cjs");
const SRC_DIR = resolve(REPO_ROOT, "src");

async function maxMtime(dir) {
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

async function ensureBinaryBuilt() {
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
}

const setup = async (project) => {
  await ensureBinaryBuilt();

  project.onTestsRerun(ensureBinaryBuilt);
};

export { setup };
