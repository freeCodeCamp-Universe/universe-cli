import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loadToken as defaultLoadToken } from "./token-store.js";

const execFileP = promisify(execFile);

/**
 * Identity priority chain — ADR-016 Q10 (post-authz-followups).
 *
 *   1. $GITHUB_TOKEN env (CI explicit)
 *   2. $GH_TOKEN env (CI explicit, legacy alias)
 *   3. Device-flow stored token (~/.config/universe-cli/token) — `universe login`
 *   4. `gh auth token` shell-out (laptop fallback if no `universe login`)
 *
 * Slots 3 and 4 were swapped (was: gh CLI > device-flow) to:
 *   - Prefer least-privilege: device-flow token is a GitHub App `ghu_`
 *     user-to-server token scoped to the App's installation; `gh` CLI
 *     token is a broader `gho_` OAuth user token.
 *   - Surface App-installation gaps at user time. Previously a working
 *     `gh` token masked App-install misconfig (see B1).
 *   - Align runtime identity with the documented onboarding command.
 *
 * `gh` CLI remains a working fallback — first-time staff who installed
 * `gh` but never ran `universe login` still get an identity.
 *
 * GHA OIDC and Woodpecker OIDC slots were dropped: artemis validates
 * bearers via GitHub `GET /user`, which only accepts user-scoped PATs /
 * OAuth / App user-to-server tokens — OIDC ID tokens cannot satisfy
 * that probe. CI users must explicitly export `$GITHUB_TOKEN`. Re-add
 * these slots only when artemis grows an OIDC verifier.
 *
 * Source labels are stable strings used by `whoami` output and tests.
 */

export type IdentitySource = "env_GITHUB_TOKEN" | "env_GH_TOKEN" | "gh_cli" | "device_flow";

export interface ResolvedIdentity {
  token: string;
  source: IdentitySource;
}

export interface ResolveIdentityOptions {
  env?: NodeJS.ProcessEnv;
  execGhAuthToken?: () => Promise<string | null>;
  loadStoredToken?: () => Promise<string | null>;
}

function isNonEmpty(s: string | null | undefined): s is string {
  return typeof s === "string" && s.trim().length > 0;
}

async function defaultExecGhAuthToken(): Promise<string | null> {
  try {
    const { stdout } = await execFileP("gh", ["auth", "token"], {
      timeout: 5_000,
    });
    return stdout;
  } catch {
    return null;
  }
}

export async function resolveIdentity(
  opts: ResolveIdentityOptions = {},
): Promise<ResolvedIdentity | null> {
  const env = opts.env ?? process.env;
  const execGh = opts.execGhAuthToken ?? defaultExecGhAuthToken;
  const loadStored = opts.loadStoredToken ?? defaultLoadToken;

  // Slot 1 — env vars (GITHUB_TOKEN preferred over GH_TOKEN).
  const ghEnv = env["GITHUB_TOKEN"];
  if (isNonEmpty(ghEnv)) {
    return { token: ghEnv.trim(), source: "env_GITHUB_TOKEN" };
  }
  const ghTokenEnv = env["GH_TOKEN"];
  if (isNonEmpty(ghTokenEnv)) {
    return { token: ghTokenEnv.trim(), source: "env_GH_TOKEN" };
  }

  // Slot 3 — device-flow stored token (`universe login`). Preferred
  // over `gh` CLI: tighter scope (App installation) and surfaces
  // App-install gaps immediately for staff users.
  const stored = await loadStored();
  if (isNonEmpty(stored)) {
    return { token: stored.trim(), source: "device_flow" };
  }

  // Slot 4 — gh auth token shell-out (fallback for users without
  // `universe login`).
  const ghCli = await execGh();
  if (isNonEmpty(ghCli)) {
    return { token: ghCli.trim(), source: "gh_cli" };
  }

  return null;
}
