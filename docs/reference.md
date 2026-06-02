# Reference

Every `universe` command, flag, exit code, and environment variable. Task walkthroughs live in [`STAFF-GUIDE.md`](STAFF-GUIDE.md); the config schema in [`platform-yaml.md`](platform-yaml.md). The CLI is an identity-only client: it carries your GitHub bearer to the **artemis** proxy (`uploads.freecode.camp`), which owns the R2 credentials and the registry.

## Global conventions

- **`--json`** — accepted by every command. Envelope on **stdout**; human errors on **stderr**, so `… --json | jq` stays clean. Required in non-TTY/CI for commands that otherwise prompt.
- **`--help` / `-h`**, **`--version` / `-v`** — per-command help and version.
- **Namespaces** — `static`, `sites`, `repo` group verbs; global flags may precede the namespace token (`universe --json static deploy`).
- **Auto-update check** — a detached background process checks npm for a newer version (cached 1 h, override `UNIVERSE_UPDATE_TTL_MS`; 3 s timeout) and the next run prints a notice to **stderr** only. Survives error/exit paths. Disable with `UNIVERSE_NO_UPDATE_CHECK=1`.

## Commands

### Top-level

| Command           | Flags                                                         | Purpose                                                                    |
| ----------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `universe init`   | `--site <slug>`, `--dir <path>`, `--force`, `--yes`, `--json` | Scaffold a `platform.yaml` in the current directory.                       |
| `universe login`  | `--force`, `--json`                                           | GitHub OAuth device flow → token at `~/.config/universe-cli/token` (0600). |
| `universe logout` | `--json`                                                      | Delete the stored device-flow token.                                       |
| `universe whoami` | `--json`                                                      | Resolved login, identity source, proxy URL, authorized-site count.         |

`init` needs no network or identity. It derives `site` from the git `origin` remote (falling back to the directory name), sanitized to `SITE_NAME_PATTERN`, and infers `build.command` from `package.json`'s `build` script plus the lockfile's package manager. In a TTY it prompts for each field; `--yes`, `--json`, or a non-TTY write the derived defaults. It refuses to clobber an existing `platform.yaml` unless `--force` is passed (exit 11). Source: `src/commands/init.ts`.

### `static` — deploy lifecycle

| Command                    | Flags                                  | Purpose                                                                                                                           |
| -------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `universe static deploy`   | `--promote`, `--dir <path>`, `--json`  | Build (if `build.command` set) and upload to **preview**. `--promote` finalizes as production.                                    |
| `universe static promote`  | `--from <deployId>`, `--json`          | Re-point production at the current preview, or at `--from`.                                                                       |
| `universe static rollback` | `--to <deployId>` (required), `--json` | Rewrite the production alias to a past deploy id.                                                                                 |
| `universe static ls`       | `--site <slug>`, `--json`              | Recent deploys for the `platform.yaml` site, or `--site`. A `STATE` column flags `preview` / `production` / `preview+production`. |

Deploy ids are `YYYYMMDD-HHMMSS-<gitsha>` (or `nogit-<ts>` outside a git repo). `promote`/`rollback` send a compare-and-swap guard; a concurrent change returns `alias_drift` (interactive retry, or exit 10 + `current` field under `--json`). `static ls` cross-references the preview and production aliases so each row shows whether it is the current `preview`, `production`, both, or neither (a superseded build); `--json` adds a per-deploy `state` plus a top-level `aliases` object. Source: `src/commands/{deploy,promote,rollback,ls}.ts`.

### `sites` — registry (staff-gated writes)

| Command                          | Flags                                | Purpose                                                         |
| -------------------------------- | ------------------------------------ | --------------------------------------------------------------- |
| `universe sites ls`              | `--mine`, `--json`                   | List registered sites; `--mine` filters to your authorized set. |
| `universe sites register <slug>` | `--team <name>`, `--json`            | Register a site (staff). `--team` defaults to `staff`.          |
| `universe sites update <slug>`   | `--team <name>` (required), `--json` | Replace the teams list (staff).                                 |
| `universe sites rm <slug>`       | `--json`                             | Delete the entry (staff). R2 bytes untouched; age out via cron. |

`--team` is comma-separated and repeatable; values are GitHub team slugs in `freeCodeCamp-Universe`. Slug `^[a-z][a-z0-9-]{0,62}$`, team `^[a-z0-9][a-z0-9_-]{0,38}$`. Source: `src/commands/sites/`.

### `repo` — repository requests + approval queue

| Command                       | Flags                                                                                            | Purpose                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `universe repo create [name]` | `--visibility <public\|private>`, `--template <repo>`, `--description <text>`, `--yes`, `--json` | Request a repo under `freeCodeCamp-Universe` (staff). Prompts when bare; `--yes` required non-TTY.                            |
| `universe repo ls`            | `--status <state>`, `--all`, `--mine`, `--json`                                                  | List requests. `--status` ∈ `pending\|approved\|active\|rejected\|failed\|all` (default `pending`); `--all` = `--status all`. |
| `universe repo status <id>`   | `--json`                                                                                         | One request's lifecycle state.                                                                                                |
| `universe repo approve <id>`  | `--yes`, `--json`                                                                                | Approve → create via the Apollo-11 App (approver team). Synchronous.                                                          |
| `universe repo reject <id>`   | `--reason <text>`, `--yes`, `--json`                                                             | Reject a pending request (approver team).                                                                                     |
| `universe repo rm <id>`       | `--yes`, `--json`                                                                                | Delete a request, freeing its repo name (approver team). Removes only the queue record, not any GitHub repo.                  |

`--visibility` defaults to `private`; `--description` ≤350 chars; repo name `^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$`. Status machine: `pending → approved → active` / `approved → failed` / `pending → rejected`; the approve outcome is `ok` or `approved_failed`. authz: create/ls/status → `staff`; approve/reject/rm → `gh-artemis-approvers`. A create that hits `already_exists` self-heals when the claimed name's GitHub repo was deleted (artemis reconciles the stale claim); otherwise `repo rm <id>` clears it. Source: `src/commands/repo/`.

## Exit codes

Stable contract — `src/output/exit-codes.ts`. Callers import the constants, never integers.

| Code | Name          | Meaning                                                                                        |
| ---- | ------------- | ---------------------------------------------------------------------------------------------- |
| 0    | `SUCCESS`     | Completed.                                                                                     |
| 10   | `USAGE`       | Bad input — unknown flag, missing arg, or a 400/404/409 (incl. alias drift, deploy not found). |
| 11   | `CONFIG`      | `platform.yaml` missing/invalid, or build output dir missing/not a directory.                  |
| 12   | `CREDENTIALS` | Auth failed (401/403) — re-`login`, or the token is not user-scoped.                           |
| 13   | `STORAGE`     | Server/network failure (5xx, timeout, 422), or a symlink escape.                               |
| 15   | `GIT`         | No files to deploy (empty upload set after the ignore filter). Git itself is not required.     |
| 18   | `CONFIRM`     | Confirmation declined (answered no, or `--yes` absent).                                        |
| 19   | `PARTIAL`     | Some files failed to upload; the deploy was not finalized.                                     |

Codes 14, 16, 17 are reserved for contract stability and no longer emitted.

**Error envelope** (`--json`): `{"schemaVersion":"1","command":"…","success":false,"timestamp":"…","error":{"code":<exit>,"message":"…","kind":"<artemis label>","requestId":"<id>"}}`. `kind`, `requestId`, and an optional `issues[]` appear only when set. Shape: `src/output/envelope.ts`.

## Identity

`resolveIdentity` (`src/lib/identity.ts`) evaluates **four ordered sources**, returning on the first non-empty match. `whoami` reports the one that fired by its label — there is no slot number.

| Order | Source                         | Label              | When                                                        |
| ----- | ------------------------------ | ------------------ | ----------------------------------------------------------- |
| 1     | `$GITHUB_TOKEN`                | `env_GITHUB_TOKEN` | CI explicit. Checked first.                                 |
| 2     | `$GH_TOKEN`                    | `env_GH_TOKEN`     | CI explicit; legacy alias, only when `$GITHUB_TOKEN` unset. |
| 3     | `~/.config/universe-cli/token` | `device_flow`      | `universe login` (mode 0600; honors `$XDG_CONFIG_HOME`).    |
| 4     | `gh auth token`                | `gh_cli`           | Laptop fallback when no login token but `gh` is authed.     |

Source 3 outranks 4 by design: the device-flow `ghu_` token is scoped to the App installation (narrower than `gh`'s `gho_`) and surfaces App-install gaps early. The env sources outrank both — exporting `$GITHUB_TOKEN` always wins.

artemis validates every bearer with `GET /user` and authorizes via `GET /user/teams` — so a bearer must be **user-scoped** (PAT, OAuth user, or App user-to-server token). A GitHub App **installation** token (the default GHA `secrets.GITHUB_TOKEN`) has no user → `403` → `CREDENTIALS` (12). `universe login` requests `read:org user:email`; `read:org` (and, under SAML SSO, an org-authorized token) is what makes team membership resolve. A `user_unauthorized` failure means the token can't prove membership — check the active source with `whoami`.

**Precedence** (highest wins): CLI flags > environment variables > `platform.yaml` defaults.

## Environment

| Env                         | Default                         | Scope        | Purpose                                                            |
| --------------------------- | ------------------------------- | ------------ | ------------------------------------------------------------------ |
| `GITHUB_TOKEN` / `GH_TOKEN` | —                               | all          | Identity sources 1–2. Must be user-scoped.                         |
| `UNIVERSE_PROXY_URL`        | `https://uploads.freecode.camp` | all          | Point at a different artemis host (staging, mirror).               |
| `UNIVERSE_FETCH_TIMEOUT_MS` | `30000`                         | all          | Per-request timeout to artemis, ms. `0` disables.                  |
| `UNIVERSE_NO_UPDATE_CHECK`  | —                               | all          | `1`/`true` disables the background update check.                   |
| `UNIVERSE_UPDATE_TTL_MS`    | `3600000`                       | all          | Update-check cache TTL, ms. Lower = fresher; `0` checks every run. |
| `UNIVERSE_DEBUG`            | —                               | all          | `1`/`true` logs raw proxy request/response. Verbose; debugging.    |
| `NO_COLOR`                  | —                               | all          | Standard; suppresses color in the update notice.                   |
| `UNIVERSE_GH_CLIENT_ID`     | baked-in App client id          | `login` only | Override the device-flow GitHub App (fork / self-host tenants).    |
| `XDG_CONFIG_HOME`           | `~/.config`                     | login/logout | Base dir for the token store (`<base>/universe-cli/token`).        |

The baked-in client id is **public** — the device flow uses no `client_secret`, so embedding it leaks nothing. No setting is ever read from a `.env` file.
