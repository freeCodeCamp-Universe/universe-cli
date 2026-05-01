import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  IdentityResolver,
  IdentitySource,
  ResolvedIdentity,
} from "./identity-resolver.port.js";

/**
 * Identity priority chain — ADR-016 Q10 (post-F7).
 *
 *   1. $GITHUB_TOKEN / $GH_TOKEN env (CI explicit)
 *   2. `gh auth token` shell-out (laptop with gh installed)
 *   3. Device-flow stored token (~/.config/universe-cli/token)
 *
 * GHA OIDC and Woodpecker OIDC slots were dropped: artemis validates
 * bearers via GitHub `GET /user`, which only accepts user-scoped PATs /
 * OAuth tokens — OIDC ID tokens cannot satisfy that probe. CI users
 * must explicitly export `$GITHUB_TOKEN`. Re-add these slots only when
 * artemis grows an OIDC verifier.
 *
 * Source labels are stable strings used by `whoami` output and tests.
 */

const execFileP = promisify(execFile);

const isNonEmpty = (s: string | null | undefined): s is string =>
  typeof s === "string" && s.trim().length > 0;

const defaultExecGhAuthToken = async (): Promise<string | null> => {
  try {
    const { stdout } = await execFileP("gh", ["auth", "token"], { timeout: 5_000 });
    return stdout;
  } catch {
    return null;
  }
};

interface GithubIdentityResolverOptions {
  env?: NodeJS.ProcessEnv;
  execGhAuthToken?: () => Promise<string | null>;
  loadStoredToken?: () => Promise<string | null>;
}

class GithubIdentityResolver implements IdentityResolver {
  private readonly env: NodeJS.ProcessEnv;
  private readonly execGhAuthToken: () => Promise<string | null>;
  private readonly loadStoredToken: () => Promise<string | null>;

  constructor(opts?: GithubIdentityResolverOptions) {
    this.env = opts?.env ?? process.env;
    this.execGhAuthToken = opts?.execGhAuthToken ?? defaultExecGhAuthToken;
    this.loadStoredToken = opts?.loadStoredToken ?? (() => Promise.resolve(null));
  }

  async resolve(): Promise<ResolvedIdentity | null> {
    // Slot 1 — env vars (GITHUB_TOKEN preferred over GH_TOKEN).
    const ghEnv = this.env["GITHUB_TOKEN"];
    if (isNonEmpty(ghEnv)) {
      return { source: "env_GITHUB_TOKEN" as IdentitySource, token: ghEnv.trim() };
    }
    const ghTokenEnv = this.env["GH_TOKEN"];
    if (isNonEmpty(ghTokenEnv)) {
      return { source: "env_GH_TOKEN" as IdentitySource, token: ghTokenEnv.trim() };
    }

    // Slot 2 — gh auth token shell-out.
    const ghCli = await this.execGhAuthToken();
    if (isNonEmpty(ghCli)) {
      return { source: "gh_cli" as IdentitySource, token: ghCli.trim() };
    }

    // Slot 3 — device-flow stored token.
    const stored = await this.loadStoredToken();
    if (isNonEmpty(stored)) {
      return { source: "device_flow" as IdentitySource, token: stored.trim() };
    }

    return null;
  }
}

export { GithubIdentityResolver };
export type { GithubIdentityResolverOptions };
