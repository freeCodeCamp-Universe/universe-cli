# Reference

Every `universe` command, flag, exit code, and environment variable. Task walkthroughs live in [`STAFF-GUIDE.md`](STAFF-GUIDE.md); the config schema in [`platform-yaml.md`](platform-yaml.md). The CLI is an identity-only client: it carries your GitHub bearer to the **artemis** proxy (`uploads.freecode.camp`), which owns the R2 credentials and the registry.

## Global conventions

- **`--json`** — accepted by every command. Envelope on **stdout**, human errors on **stderr**, so `… --json | jq` stays clean. Required in non-TTY/CI wherever a command would otherwise prompt.
- **`--help` / `-h`**, **`--version` / `-v`** — per-command help and version.
- **Full words are the verbs; the short forms are aliases.** Every namespace spells `list` and `remove` in help, docs and the `--json` `command` field. `ls` and `rm` keep working as shortcuts.
- **Namespaces** — `static`, `sites`, `repo` and `audit` group verbs; global flags may precede the namespace token (`universe --json static deploy`).
- **Auto-update check** — a detached process checks npm (cached 1 h, override `UNIVERSE_UPDATE_TTL_MS`; 3 s timeout); the next run prints a notice to **stderr** only, on error and exit paths alike. Disable with `UNIVERSE_NO_UPDATE_CHECK=1`.

## Commands

### Top-level

| Command           | Flags                                                                                                                                                      | Purpose                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `universe create` | `--name <name>`, `--runtime <rt>`, `--framework <fw>`, `--database <db...>`, `--service <svc...>`, `--pkg-manager <pm>`, `--force-fetch`, `--yes`, `--json` | Scaffold a new project from layered templates into a subdirectory.         |
| `universe init`   | `--site <slug>`, `--dir <path>`, `--force`, `--yes`, `--json`                                                                                               | Scaffold a `platform.yaml` in the current directory.                       |
| `universe login`  | `--force`, `--json`                                                                                                                                         | GitHub OAuth device flow → token at `~/.config/universe-cli/token` (0600). |
| `universe logout` | `--json`                                                                                                                                                    | Delete the stored device-flow token.                                       |
| `universe whoami` | `--json`                                                                                                                                                    | Resolved login, identity source, proxy URL, authorized-site count.         |

`create` and `init` need no network and no identity. In a TTY both prompt; `--yes`, `--json`, or a non-TTY use derived defaults, and `create` then requires `--name`.

- `create` — fetches templates from an external repository (cached; `--force-fetch` re-downloads), writes the project and a generated `platform.yaml` into `./<name>`, installs dependencies, runs `git init`. Source: `src/commands/create/`.
- `init` — derives `site` from the git `origin` remote, else the directory name, sanitized to `SITE_NAME_PATTERN`; infers `build.command` from `package.json`'s `build` script and the lockfile's package manager. Refuses to clobber an existing `platform.yaml` without `--force` (exit 11). Source: `src/commands/init.ts`.

### `static` — deploy lifecycle

| Command                    | Flags                                                               | Purpose                                                                                                                           |
| -------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `universe static deploy`   | `--promote`, `--dir <path>`, `--no-reuse`, `--allow-dirty`, `--json` | Build (if `build.command` set) and upload to **preview**. `--promote` finalizes as production.                                    |
| `universe static promote`  | `--from <deployId>`, `--allow-dirty`, `--json`                       | Re-point production at the current preview, or at `--from`. Never reads git state and never rebuilds.                             |
| `universe static rollback` | `--to <deployId>` (required), `--json`                               | Rewrite the production alias to a past deploy id.                                                                                 |
| `universe static list`     | `--site <slug>`, `--json`                                            | Recent deploys for the `platform.yaml` site, or `--site`. A `STATE` column flags `preview` / `production` / `preview+production`. |

Deploy ids are `YYYYMMDD-HHMMSS-<sha7>`. artemis truncates the sha to seven characters, so the CLI mints every non-commit sha at exactly seven. `--json` names the stamp in force through `shaSource`:

| `shaSource` | sha sent                | when                                            | `--allow-dirty` | preview reuse |
| ----------- | ----------------------- | ----------------------------------------------- | --------------- | ------------- |
| `head`      | the full HEAD hash      | clean tree, no `--dir`                          | no              | yes           |
| `dirty`     | `dty` + 4 random base36 | working tree has uncommitted changes            | yes             | no            |
| `dirover`   | `dov` + 4 random base36 | `--dir` overrode `build.output` on a clean tree | yes             | no            |
| `synthetic` | `nog` + 4 random base36 | not a git repository                            | no              | no            |

- Checked in the order `synthetic`, `dirty`, `dirover`, `head`; first match wins, so `--dir` on a dirty tree stamps `dirty`. The sentinels are not hex, so no commit sha can prefix-match one.
- Exit 15 without `--allow-dirty`: `deploy` on a dirty tree or a `--dir` override, `promote` on a `dty`/`dov` id. With the flag both warn and proceed, stamp intact. `nog` never needs it.
- A sentinel replaces the commit, so `--json` keeps it in `headSha` and the summary prints a `Commit:` line. `headSha` is absent when the stamp is `head`, and outside a git repository.

**Preview reuse.** `deploy --promote` on a clean tree whose preview is already at `HEAD` promotes that exact build instead of rebuilding a duplicate.

- `--json` always carries `reusedPreview`: `true` on the fast path, `false` on a rebuild. `fileCount` and `totalSize` count only this invocation's upload, so both read `0` on the fast path; the deploy keeps its original files.
- Any stamp but `head` opts out both ways: that preview cannot be reused, and that build cannot be reused later.
- `--no-reuse` opts out for one invocation, without changing the deploy id. Reach for it when the build reads an input git cannot see — an environment variable, a gitignored file.
- `--promote` never repoints the preview alias, so a later bare `deploy --promote` at the same commit can still reuse the older preview.
- Previews minted before these stamps carry a commit sha even when built from a dirty tree, so the fast path can still match one. The window closes for a site once it deploys with a stamping CLI.

`static promote` is a pure alias rewrite: it promotes whatever the preview alias holds. A sentinel-stamped deploy warns and reports its stamp in `shaSource`; every hex sha reports `unverified`, since `promote` sees only the deploy id. Only `deploy` reports `head`.

`promote`/`rollback` send a compare-and-swap guard; a concurrent change returns `alias_drift` — interactive retry, or exit 10 plus a `current` field under `--json`. `static list` cross-references both aliases, so each row reads `preview`, `production`, both, or neither (a superseded build); `--json` adds a per-deploy `state` and a top-level `aliases`. Source: `src/commands/{deploy,promote,rollback,list}.ts`, `src/deploy/stamp.ts`.

### `sites` — registry (staff-gated writes)

| Command                          | Flags                                | Purpose                                                                                                                               |
| -------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `universe sites list`            | `--mine`, `--held`, `--json`         | List registered sites; `--mine` filters to your authorized set; `--held` lists names held by a delete (not combinable with `--mine`). |
| `universe sites register <slug>` | `--team <name>`, `--json`            | Register a site (staff). `--team` defaults to `staff`.                                                                                |
| `universe sites update <slug>`   | `--team <name>` (required), `--json` | Replace the teams list (staff).                                                                                                       |
| `universe sites remove <slug>`   | `--json`                             | Take the site offline and hold its name (staff). Reversible with `undelete` while the hold lasts.                                     |
| `universe sites undelete <slug>` | `--json`                             | Bring back a site while its name is still held (staff).                                                                               |
| `universe sites release <slug>`  | `-y`, `--yes`, `--json`              | Free a held name now and trash its files (approvers). Not reversible.                                                                 |

**A delete does not free the name.** `remove` takes the site offline and holds its slug so nobody else can register it; `undelete` restores the site and both alias pointers, which the server reports once and then forgets.

- The hold is **72 hours by default**, overridden per deployment by `SITE_RESERVATION_GRACE`. Read the real deadline from `sites list --held`, never by counting from the delete.
- On expiry the name frees itself and the files are cleaned up.
- `release` ends the hold early, freeing the name and trashing the files in one irreversible step. Approver-gated; exit 18 without `--yes` in any non-interactive mode.
- Server floors: `undelete` and `release` need artemis **1.10.0**; `list --held` needs **1.10.2**.

Every site-scoped path — `promote`, `rollback`, deploy init, upload, finalize, deploys, trash, alias, deploy-delete, deploy-restore — reads the same three states:

| State      | When                               | Answer                                   | Exit |
| ---------- | ---------------------------------- | ---------------------------------------- | ---- |
| **Active** | registered, not deleted            | the call proceeds                        | —    |
| **Held**   | deleted, still inside the grace    | `409 site_reserved`, carrying the expiry | 10   |
| **Gone**   | the hold expired, or `release` ran | `403 site_unauthorized`                  | 12   |

For up to 60 seconds after the change, write verbs may answer `410 site_gone` (exit 10) instead of `403` — the window in which the cached snapshot still lists a name the registry has dropped. `sites register` on a held name returns `409` and the CLI names `undelete`, but it does not carry the expiry; `sites list --held` does.

`--team` is comma-separated and repeatable; values are GitHub team slugs in `freeCodeCamp-Universe`. Slug `^[a-z][a-z0-9-]{0,62}$`, team `^[a-z0-9][a-z0-9_-]{0,38}$`. There is no in-place slug **rename** — `register` the new slug, redeploy under it, then `remove` the old one ([recipe](STAFF-GUIDE.md#rename-a-site-slug)). Source: `src/commands/sites/`.

### `repo` — repository requests + approval queue

| Command                       | Flags                                                                                            | Purpose                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `universe repo create [name]` | `--visibility <public\|private>`, `--template <repo>`, `--description <text>`, `--yes`, `--json` | Request a repo under `freeCodeCamp-Universe` (staff). Prompts when bare; `--yes` required non-TTY.                            |
| `universe repo list`          | `--status <state>`, `--all`, `--mine`, `--json`                                                  | List requests. `--status` ∈ `pending\|approved\|active\|rejected\|failed\|all` (default `pending`); `--all` = `--status all`. |
| `universe repo status <id>`   | `--json`                                                                                         | One request's lifecycle state.                                                                                                |
| `universe repo approve <id>`  | `--yes`, `--json`                                                                                | Approve → create via the Apollo-11 App (approver team). Synchronous.                                                          |
| `universe repo reject <id>`   | `--reason <text>`, `--yes`, `--json`                                                             | Reject a pending request (approver team).                                                                                     |
| `universe repo remove <id>`   | `--yes`, `--json`                                                                                | Delete a request, freeing its repo name (approver team). Removes only the queue record, not any GitHub repo.                  |

`--visibility` defaults to `private`; `--description` ≤350 chars; repo name `^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$`. Status machine: `pending → approved → active` / `approved → failed` / `pending → rejected`; the approve outcome is `ok` or `approved_failed`. authz: create/list/status → `staff`; approve/reject/remove → `gh-artemis-approvers`. A create that hits `already_exists` self-heals when the claimed name's GitHub repo was deleted (artemis reconciles the stale claim); otherwise `repo remove <id>` clears it. Source: `src/commands/repo/`.

### `audit` — durable audit trail

| Command               | Flags                                                                                                 | Purpose                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `universe audit list` | `--actor <login>`, `--action <action>`, `--site <slug>`, `--since <rfc3339>`, `--limit <n>`, `--json` | Read the durable record of who did what. |

Every filter is optional and they combine. `--action` takes a full label such as `repo.approve`. `--since` takes an RFC 3339 timestamp and returns events at or after it. `--limit` rejects a negative or non-numeric value, exiting `USAGE` (10) before any request goes out. It does not reject a malformed one: `src/cli.ts` parses with `Number.parseInt`, so `2.9` and `3x` are coerced to `2` and `3`. The default of 100 and the ceiling of 500 are artemis's, not the CLI's.

The table prints five columns: `OCCURRED AT`, `ACTOR`, `ACTION`, `TARGET`, `OUTCOME`. `TARGET` reads `<site>/<deployId>` when the event carries both, else the site, else the deploy id, else the `name` field from the event detail. An empty result prints `No audit events.`

`--json` returns `count`, `events[]`, and `identitySource`. Each event carries `id`, `occurredAt`, `actor`, `action`, `outcome`, and the optional `site`, `deployId`, `requestId` and `detail`. Reads `GET /api/audit`, which is team-gated on `AUDIT_READ_AUTHZ_TEAM` (default `staff`) because the trail is cross-tenant. A non-member exits `CREDENTIALS` (12). Source: `src/commands/audit/`.

The proxy also accepts an `offset` for paging, but the CLI exposes no flag for it — raise the `--limit` instead.

## Exit codes

Stable contract — `src/output/exit-codes.ts`. Callers import the constants, never integers.

| Code | Name          | Meaning                                                                                                                                                        |
| ---- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | `SUCCESS`     | Completed.                                                                                                                                                     |
| 10   | `USAGE`       | Bad input — unknown flag, missing arg, or a 400/404/409/410 (incl. alias drift, deploy not found, site released).                                              |
| 11   | `CONFIG`      | `platform.yaml` missing/invalid, or build output dir missing/not a directory.                                                                                  |
| 12   | `CREDENTIALS` | Auth failed (401/403) — re-`login`, or the token is not user-scoped.                                                                                           |
| 13   | `STORAGE`     | Server/network failure (5xx, timeout, 422), or a symlink escape.                                                                                               |
| 15   | `GIT`         | No files to deploy (empty upload set after the ignore filter), or a `dty`/`dov` deploy or promote refused without `--allow-dirty`. Git itself is not required. |
| 18   | `CONFIRM`     | Confirmation declined (answered no, or `--yes` absent).                                                                                                        |
| 19   | `PARTIAL`     | Some files failed to upload; the deploy was not finalized.                                                                                                     |

Codes 14, 16, 17 are reserved for contract stability and no longer emitted.

**Error envelope** (`--json`): `{"schemaVersion":"1","command":"…","success":false,"timestamp":"…","error":{"code":<exit>,"message":"…","kind":"<artemis label>","requestId":"<id>"}}`. `kind`, `requestId`, and an optional `issues[]` appear only when set. Shape: `src/output/envelope.ts`.

**`command` values changed with the full-word verb rename.** `schemaVersion` stays `"1"` — the shape is unchanged — but six values moved. A consumer matching an old string no longer matches.

| before     | after          |
| ---------- | -------------- |
| `sites ls` | `sites list`   |
| `sites rm` | `sites remove` |
| `repo ls`  | `repo list`    |
| `repo rm`  | `repo remove`  |
| `audit ls` | `audit list`   |
| `ls`       | `list`         |

The last row is the `static` group. It reports its verb with no namespace prefix — `list`, `deploy`, `promote`, `rollback` — so only its verb moved; it gained no prefix.

## Identity

`resolveIdentity` (`src/lib/identity.ts`) evaluates **four ordered sources**, returning on the first non-empty match. `whoami` reports the one that fired by its label — there is no slot number.

| Order | Source                         | Label              | When                                                        |
| ----- | ------------------------------ | ------------------ | ----------------------------------------------------------- |
| 1     | `$GITHUB_TOKEN`                | `env_GITHUB_TOKEN` | CI explicit. Checked first.                                 |
| 2     | `$GH_TOKEN`                    | `env_GH_TOKEN`     | CI explicit; legacy alias, only when `$GITHUB_TOKEN` unset. |
| 3     | `~/.config/universe-cli/token` | `device_flow`      | `universe login` (mode 0600; honors `$XDG_CONFIG_HOME`).    |
| 4     | `gh auth token`                | `gh_cli`           | Laptop fallback when no login token but `gh` is authed.     |

Source 3 outranks 4 by design: the device-flow `ghu_` token is scoped to the App installation, narrower than `gh`'s `gho_`.

artemis validates every bearer with `GET /user` and authorizes via `GET /user/teams`, so a bearer must be **user-scoped** — a PAT, an OAuth user token, or an App user-to-server token. A GitHub App **installation** token, the default GHA `secrets.GITHUB_TOKEN`, has no user: `403` → `CREDENTIALS` (12). `universe login` requests `read:org user:email`; `read:org`, plus an org-authorized token under SAML SSO, is what makes team membership resolve. A `user_unauthorized` failure means the token cannot prove membership — check the active source with `whoami`.

**Precedence** (highest wins): CLI flags > environment variables > `platform.yaml` defaults.

## Environment

| Env                          | Default                         | Scope        | Purpose                                                                         |
| ---------------------------- | ------------------------------- | ------------ | ------------------------------------------------------------------------------- |
| `GITHUB_TOKEN` / `GH_TOKEN`  | —                               | all          | Identity sources 1–2. Must be user-scoped.                                      |
| `UNIVERSE_PROXY_URL`         | `https://uploads.freecode.camp` | all          | Point at a different artemis host (staging, mirror).                            |
| `UNIVERSE_FETCH_TIMEOUT_MS`  | `30000`                         | all          | Per-request timeout to artemis, ms. `0` disables.                               |
| `UNIVERSE_NO_UPDATE_CHECK`   | —                               | all          | `1`/`true` disables the background update check and the template version check. |
| `UNIVERSE_UPDATE_TTL_MS`     | `3600000`                       | all          | Update-check cache TTL, ms. Lower = fresher; `0` checks every run.              |
| `UNIVERSE_DEBUG`             | —                               | all          | `1`/`true` logs raw proxy request/response. Verbose; debugging.                 |
| `NO_COLOR`                   | —                               | all          | Standard; suppresses color in the update notice.                                |
| `UNIVERSE_TEMPLATES_VERSION` | (baked-in)                      | `create`     | Override the template version used by `universe create`.                        |
| `UNIVERSE_GH_CLIENT_ID`      | baked-in App client id          | `login` only | Override the device-flow GitHub App (fork / self-host tenants).                 |
| `XDG_CONFIG_HOME`            | `~/.config`                     | login/logout | Base dir for the token store (`<base>/universe-cli/token`).                     |

The baked-in client id is **public** — the device flow uses no `client_secret`, so embedding it leaks nothing. No setting is ever read from a `.env` file.
