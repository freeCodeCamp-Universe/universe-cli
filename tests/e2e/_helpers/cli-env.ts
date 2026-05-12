import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Per-test isolated environment for the E2E suite.
 *
 * Builds a hermetic NodeJS.ProcessEnv (no inheritance from the host)
 * with a fresh XDG_CONFIG_HOME under os.tmpdir() and UNIVERSE_PROXY_URL
 * pointed at a fake-artemis instance. Direct `process.env` mutation in
 * test bodies is forbidden (SPEC §V8) — every test goes through this.
 */

export interface CliEnvOptions {
  /** Base URL of a running fake-artemis (e.g. fixture.url). */
  proxyUrl: string;
  /**
   * If set, written to $XDG_CONFIG_HOME/universe-cli/token (mode 0600).
   * Exercises the device-flow stored-token slot of the identity chain.
   */
  seedToken?: string;
  /**
   * If set, exposed as $GITHUB_TOKEN. Wins slot 1 of the identity chain
   * — use for happy paths where the goal is the CLI roundtrip, not
   * which slot resolved.
   */
  githubToken?: string;
  /** Extra env keys merged last (overrides all of the above). */
  extraEnv?: NodeJS.ProcessEnv;
}

export interface CliEnv {
  env: NodeJS.ProcessEnv;
  xdgDir: string;
  cleanup: () => Promise<void>;
}

export async function makeCliEnv(opts: CliEnvOptions): Promise<CliEnv> {
  const xdgDir = await mkdtemp(join(tmpdir(), "universe-cli-e2e-"));

  if (opts.seedToken !== undefined) {
    const dir = join(xdgDir, "universe-cli");
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await writeFile(join(dir, "token"), opts.seedToken, { mode: 0o600 });
  }

  const env: NodeJS.ProcessEnv = {
    XDG_CONFIG_HOME: xdgDir,
    UNIVERSE_PROXY_URL: opts.proxyUrl,
    NO_COLOR: "1",
  };
  // PATH is required for the spawned-binary smoke layer to locate `node`.
  // Read-only access; we never mutate process.env (SPEC §V8).
  if (process.env["PATH"]) env["PATH"] = process.env["PATH"];
  if (opts.githubToken !== undefined) {
    env["GITHUB_TOKEN"] = opts.githubToken;
  }
  if (opts.extraEnv) {
    Object.assign(env, opts.extraEnv);
  }

  return {
    env,
    xdgDir,
    cleanup: async () => {
      await rm(xdgDir, { recursive: true, force: true });
    },
  };
}
