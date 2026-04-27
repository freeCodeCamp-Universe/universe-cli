/**
 * GitHub OAuth App "Universe CLI" — public client id, device flow only.
 *
 * Mint:
 *   https://github.com/organizations/freeCodeCamp/settings/applications
 *
 * The GitHub device flow (RFC 8628) requires only the public client id —
 * there is no `client_secret` involved, so this value is safe to bake
 * into the published binary. This matches the pattern used by `gh`,
 * `vercel`, and `supabase` CLIs.
 *
 * Fork operators / mirror tenants override via `UNIVERSE_GH_CLIENT_ID`
 * env var; the env value wins when set.
 */
export const DEFAULT_GH_CLIENT_ID = "Iv23liIuGmZRyPd5wUeN";

/**
 * Public artemis deploy proxy. Override via `UNIVERSE_PROXY_URL` env
 * (used by the integration suite + staged smoke runs against
 * `uploads-staging.freecode.camp` or local `http://localhost:8080`).
 */
export const DEFAULT_PROXY_URL = "https://uploads.freecode.camp";
