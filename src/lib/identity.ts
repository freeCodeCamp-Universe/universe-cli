import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loadToken as defaultLoadToken } from "./token-store.js";

const execFileP = promisify(execFile);

/**
 * Identity priority chain — ADR-016 Q10.
 *
 *   1. $GITHUB_TOKEN / $GH_TOKEN env (CI explicit)
 *   2. GHA OIDC ($ACTIONS_ID_TOKEN_REQUEST_URL + _TOKEN)
 *   3. Woodpecker OIDC env — placeholder; never matches in v1
 *   4. `gh auth token` shell-out
 *   5. Device-flow stored token (~/.config/universe-cli/token)
 *
 * Source labels are stable strings used by `whoami` output and tests.
 */

export type IdentitySource =
  | "env_GITHUB_TOKEN"
  | "env_GH_TOKEN"
  | "gha_oidc"
  | "woodpecker_oidc"
  | "gh_cli"
  | "device_flow";

export interface ResolvedIdentity {
  token: string;
  source: IdentitySource;
}

export interface ResolveIdentityOptions {
  env?: NodeJS.ProcessEnv;
  fetch?: typeof globalThis.fetch;
  execGhAuthToken?: () => Promise<string | null>;
  loadStoredToken?: () => Promise<string | null>;
  ghaAudience?: string;
}

interface GhaOidcResponse {
  value?: string;
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

async function tryGhaOidc(
  env: NodeJS.ProcessEnv,
  fetchImpl: typeof globalThis.fetch,
  audience: string,
): Promise<string | null> {
  const url = env["ACTIONS_ID_TOKEN_REQUEST_URL"];
  const reqTok = env["ACTIONS_ID_TOKEN_REQUEST_TOKEN"];
  if (!isNonEmpty(url) || !isNonEmpty(reqTok)) return null;

  const sep = url.includes("?") ? "&" : "?";
  const fullUrl = `${url}${sep}audience=${encodeURIComponent(audience)}`;
  try {
    const resp = await fetchImpl(fullUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${reqTok}`,
        Accept: "application/json",
      },
    });
    if (!resp.ok) return null;
    const body = (await resp.json()) as GhaOidcResponse;
    if (!isNonEmpty(body.value)) return null;
    return body.value.trim();
  } catch {
    return null;
  }
}

export async function resolveIdentity(
  opts: ResolveIdentityOptions = {},
): Promise<ResolvedIdentity | null> {
  const env = opts.env ?? process.env;
  const fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const execGh = opts.execGhAuthToken ?? defaultExecGhAuthToken;
  const loadStored = opts.loadStoredToken ?? defaultLoadToken;
  const audience = opts.ghaAudience ?? "artemis";

  // Slot 1 — env vars (GITHUB_TOKEN preferred over GH_TOKEN).
  const ghEnv = env["GITHUB_TOKEN"];
  if (isNonEmpty(ghEnv)) {
    return { token: ghEnv.trim(), source: "env_GITHUB_TOKEN" };
  }
  const ghTokenEnv = env["GH_TOKEN"];
  if (isNonEmpty(ghTokenEnv)) {
    return { token: ghTokenEnv.trim(), source: "env_GH_TOKEN" };
  }

  // Slot 2 — GHA OIDC.
  const oidc = await tryGhaOidc(env, fetchImpl, audience);
  if (oidc) {
    return { token: oidc, source: "gha_oidc" };
  }

  // Slot 3 — Woodpecker OIDC (deferred per ADR-016; placeholder).
  // Intentionally empty — falls through.

  // Slot 4 — gh auth token shell-out.
  const ghCli = await execGh();
  if (isNonEmpty(ghCli)) {
    return { token: ghCli.trim(), source: "gh_cli" };
  }

  // Slot 5 — device-flow stored token.
  const stored = await loadStored();
  if (isNonEmpty(stored)) {
    return { token: stored.trim(), source: "device_flow" };
  }

  return null;
}
