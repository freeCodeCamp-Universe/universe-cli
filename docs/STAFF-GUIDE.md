# Universe CLI — Staff Guide

End-to-end walkthrough for shipping a static constellation app to `*.freecode.camp`. The numbered steps below take a brand-new app from nothing to production; later sections cover the [site registry](#site-registry), [repository creation](#creating-a-repository), [CI & automation](#ci--automation), and [troubleshooting](#when-something-breaks). Schema: [`platform-yaml.md`](platform-yaml.md). Every command, flag, exit code, and environment variable: [`reference.md`](reference.md). Architecture, conventions, runbooks: [`README.md`](README.md).

The whole lifecycle, in order:

1. **Log in** — once per machine.
1. **Request a repo** — staff request, admin approves, artemis creates it.
1. **Register the site** — map the slug to the teams allowed to deploy it.
1. **Deploy to preview** — build and upload; the proxy returns a preview URL.
1. **Promote to production** — re-point the production alias; roll back if needed.

Steps 1–3 set an app up once; 4–5 repeat every release. If your repo exists and the slug is registered, skip to [Build & deploy to preview](#3-build--deploy-to-preview).

## Contents

**Set up once**

- [Prerequisites](#prerequisites)
- [1. Log in](#1-log-in)
- [2. Set up `platform.yaml`](#2-set-up-platformyaml)
- [Creating a repository](#creating-a-repository) — request, approve, or migrate a personal repo
- [Site registry](#site-registry) — register the slug before its first deploy

**Every release**

- [3. Build & deploy to preview](#3-build--deploy-to-preview)
- [4. Inspect deploys](#4-inspect-deploys)
- [5. Promote to production](#5-promote-to-production)
- [6. Roll back](#6-roll-back)

**Reference**

- [Common scenarios](#common-scenarios)
- [CI & automation](#ci--automation)
- [Identity & SSO](#identity--sso)
- [When something breaks](#when-something-breaks)

## Prerequisites

- `universe` CLI installed ([install](README.md#install)).
- A GitHub account in the `freeCodeCamp-Universe` org, on a team granted access to the target site. The proxy enforces team membership server-side — there is no per-site config in your repo.

That's it. No R2 token, no `.env` file, no `S3_*` variables — artemis holds every infrastructure secret.

## 1. Log in

The CLI authenticates with GitHub via OAuth device flow (scopes `read:org user:email`). One-time per laptop:

```sh
universe login
```

It prints a code and a verification URL. Open the URL, paste the code, approve. The token is stored at `~/.config/universe-cli/token` (mode `0600`; honors `$XDG_CONFIG_HOME`).

Check it worked:

```sh
universe whoami
```

This prints your resolved GitHub login, **which identity source fired** (`env_GITHUB_TOKEN`, `env_GH_TOKEN`, `device_flow`, or `gh_cli`), the proxy URL, and the count of sites you can reach. For the actual list:

```sh
universe sites ls --mine
```

The split is deliberate: `whoami` stays compact even when you're on dozens of teams; the listing lives in `sites`. If `login` warns about **0 authorized sites**, the Universe CLI GitHub App likely isn't installed on the org, or you're on no team granted a site — see [Identity & SSO](#identity--sso). The identity chain in full lives in [`reference.md`](reference.md#identity).

## 2. Set up `platform.yaml`

At your repo root, the only config the CLI reads:

```yaml
site: my-site
```

`site` is the slug. Hostnames are derived server-side: `<site>.freecode.camp` (production) and `<site>.preview.freecode.camp` (preview). A typical build-and-ignore setup:

```yaml
site: my-site

build:
  command: bun run build
  output: dist

deploy:
  preview: true
  ignore:
    - "*.map"
    - "node_modules/**"
    - ".git/**"
    - ".env*"
```

Full field reference, defaults, and validation: [`platform-yaml.md`](platform-yaml.md). A brand-new slug must be registered before its first deploy — see [Site registry](#site-registry).

## 3. Build & deploy to preview

The CLI runs your build. Two shapes:

- **`build.command` set** (common): `universe static deploy` shells out to it, then uploads `build.output`. Don't build separately.
- **`build.command` unset** (CI-artifact pattern): the build step is skipped; whatever sits in `build.output` is uploaded as-is.

Either way:

```sh
universe static deploy
```

On success the proxy returns a deploy id (`YYYYMMDD-HHMMSS-<gitsha>`) and a preview URL. Outside a git repo the id stamps `nogit-<timestamp>` instead — git is **not** required; a dirty tree only prints a warning.

| Flag           | Effect                                                                          |
| -------------- | ------------------------------------------------------------------------------- |
| `--dir <path>` | Upload from `<path>` instead of `build.output`.                                 |
| `--promote`    | Finalize as **production** in one step. Reserve for emergencies / automated CI. |
| `--json`       | Machine-readable envelope; required for CI.                                     |

**What gets uploaded:** the CLI walks `build.output`, drops `deploy.ignore` matches, and uploads the rest — 6 files in parallel, content type inferred from extension. A symlink resolving outside the output directory aborts the deploy (`STORAGE`, 13). An empty set after filtering fails with `No files to deploy` (`GIT`, 15). If any file fails mid-upload the deploy exits `PARTIAL` (19) **without** flipping the alias — re-run `deploy` (each run mints a fresh id, so retries are safe).

## 4. Inspect deploys

```sh
universe static ls
```

Lists recent deploys for the site in `platform.yaml`; `--site <slug>` inspects another site you can reach. You'll need an id to promote or roll back.

## 5. Promote to production

When the preview looks good:

```sh
universe static promote
```

This re-points the production alias at the deploy currently behind preview and returns the production URL. To push a specific past deploy:

```sh
universe static promote --from 20260511-091422-abc1234
```

`--from` rewrites **only** the production alias (it uses the rollback primitive); preview is left untouched.

## 6. Roll back

Rollback is an alias rewrite, not a redeploy. Pick a past id with `universe static ls`, then:

```sh
universe static rollback --to 20260427-141522-abc1234
```

Production points at that id; the old deploy stays in storage, so rollback is non-destructive and reversible.

**Concurrent promote / rollback (alias drift).** Both commands read the current production id first and send it as a compare-and-swap guard. If someone else moved production in between, the proxy returns `alias_drift` rather than clobbering it. Interactively the CLI prints the drift and offers a one-shot retry against the new current; with `--json` it exits `USAGE` (10) and puts the proxy's authoritative id in a top-level `current` field — branch on it and re-run. A first-ever promote (no production yet) succeeds without drift.

## Common scenarios

### Use a non-prod proxy (staging)

```sh
UNIVERSE_PROXY_URL=https://uploads.staging.freecode.camp universe static deploy
```

### Sign out

```sh
universe logout
```

Deletes the stored token. The next invocation needs `universe login` again, unless a higher-priority source like `$GITHUB_TOKEN` is set.

## Site registry

The registry maps each site slug to the GitHub teams allowed to deploy it. The proxy owns and enforces it server-side; `platform.yaml` only names the slug. **A new slug must be registered before its first deploy** — an unregistered slug fails with `Site '<slug>' is not registered`.

Reads are open to any GitHub user the proxy can identify; writes require the `staff` team.

```sh
universe sites ls                                       # every registered site
universe sites ls --mine                                # filter to sites you're authorized for
universe sites register <slug>                          # register; --team defaults to "staff"
universe sites register <slug> --team=news-editors      # register with a specific team
universe sites update <slug> --team=staff,news-editors  # REPLACE the teams list wholesale
universe sites rm <slug>                                # delete entry (R2 bytes age out via cron)
```

`update` replaces the team list, so to grant a team include the current ones alongside it. `--team` is a comma-separated, repeatable list of GitHub **team slugs** in `freeCodeCamp-Universe`.

**Slug & team rules** (artemis is the validator):

- Slug — `^[a-z][a-z0-9-]{0,62}$`: must **start with a letter**, then lowercase letters, digits, hyphens; ≤63 chars.
- Team — `^[a-z0-9][a-z0-9_-]{0,38}$`.

> The registry slug is stricter than `platform.yaml`'s `site` field, which accepts a leading digit (`1site`). A digit-initial name validates locally yet can never be registered — keep slugs letter-initial.

## Creating a repository

Staff request a new repo in `freeCodeCamp-Universe`; the request enters an approval queue; an admin approves it and the proxy creates the repo via the Apollo-11 GitHub App. (Replaces the old Google Chat / Windmill flow — same outcome, from your terminal. No GitHub App key ever touches your machine.)

A request carries a **status**: `pending → approved → active` on success, `pending → rejected` when declined, `approved → failed` when GitHub creation breaks after approval.

> Already started the repo on your **personal** account? Don't use GitHub's transfer — see [Migrating a repo you already started](others/repo-transfers.md). Request it here, re-point your remote, push.

### Request a repo (staff)

Interactively — prompts for name, visibility, description, optional template:

```sh
universe repo create
```

Or all flags (also the CI / non-interactive form; `--yes` skips confirmation):

```sh
universe repo create learn-python-rpg --visibility private --template hello-universe --yes
```

- **Name** — starts with a letter or digit, then letters, digits, `.`, `_`, `-` (≤100 chars).
- **Visibility** — `private` (default) or `public`.
- **Description** — optional, ≤350 chars.
- **Template** — an org template repo to generate from; omit for a blank repo. The picker lists templates the App can clone, falling back to free-text if that list can't be fetched.

Track it:

```sh
universe repo ls                 # pending queue (default)
universe repo ls --all           # every state — shorthand for --status all
universe repo ls --status all    # any of pending|approved|active|rejected|failed|all
universe repo ls --mine          # only your requests
universe repo status <id>        # one request's full state
```

### Approve or reject (admin)

Resolving requests requires the approver team (`gh-artemis-approvers`). Approval creates the repo synchronously, so the outcome is inline:

```sh
universe repo approve <id>                 # confirms, then creates via the Apollo-11 App
universe repo reject <id> --reason "out of scope"
universe repo rm <id>                       # delete a request, freeing its repo name
```

If GitHub creation fails after approval (e.g. the App lacks `Contents:read` on a template), `approve` reports `approved, but repository creation failed`, exits `STORAGE` (13), and the request moves to `failed` with its name freed for a retry. A request another admin already resolved returns `409`; the guard prevents double-creation.

`repo rm` deletes a request record. Use it to clear a stuck `active` row whose GitHub repo no longer exists (an `active` request is the only terminal state that still holds the name claim; `failed`/`rejected` already freed their name on resolution, so `repo rm` on those just removes a leftover record). It removes only the queue record, never a GitHub repo. Creating over a stale `active` name also self-heals: artemis verifies the repo is gone and reconciles the claim (the stale row is marked `failed`, not deleted, so its audit trail survives). Find the blocking record with `universe repo ls --all`.

## CI & automation

Export a **user-scoped** `$GITHUB_TOKEN` — it's the first identity source. **Do not** use the workflow's default `secrets.GITHUB_TOKEN`: that is a GitHub App installation token with no associated user, so artemis's `GET /user` returns `403` and the command exits `CREDENTIALS` (12). Use a token belonging to a real org-team member (classic PAT with `read:org`, fine-grained token, or a machine-user token), stored as a secret.

```yaml
- run: universe static deploy --promote --json
  env:
    GITHUB_TOKEN: ${{ secrets.UNIVERSE_DEPLOY_TOKEN }}
```

Every command takes `--json` (envelope on **stdout**, human errors on **stderr**, so `… --json | jq` stays clean). `error.code` equals the exit code; `error.kind` is the stable artemis label; `error.requestId` is the server correlation id. Commands that confirm (`repo create/approve/reject`) **require `--yes`** in a non-TTY session. Branch on exit codes, not text:

```sh
universe static deploy --promote --json || code=$?
case "${code:-0}" in
  0)  : ;;                                 # ok
  12) echo "auth — token scope/SSO"; exit 1 ;;
  19) echo "partial upload — re-run"; exit 1 ;;
  *)  echo "failed (${code})"; exit 1 ;;
esac
```

A create → approve flow, and drift handling in CI:

```sh
id=$(universe repo create my-app --visibility private --yes --json | jq -r .id)
universe repo approve "$id" --yes --json

# promote: with --json a concurrent change exits 10 with a `current` field
out=$(universe static promote --json) || true
current=$(printf '%s' "$out" | jq -r '.current // empty')
[ -n "$current" ] && universe static promote --json   # re-read + retry
```

Useful CI env: `UNIVERSE_PROXY_URL` (staging), `UNIVERSE_FETCH_TIMEOUT_MS` (default 30000; `0` disables), `UNIVERSE_NO_UPDATE_CHECK=1` (silence the update notice). Full list in [`reference.md`](reference.md#environment).

## Identity & SSO

artemis validates every bearer with `GET /user` and authorizes via `GET /user/teams` — so the token must be **user-scoped** and carry `read:org`. If the org enforces SAML SSO, the token must be authorized for the org (token settings → *Configure SSO*).

A `user_unauthorized` failure means the token can't prove team membership — missing `read:org`, missing SSO authorization, or a low-scope `$GITHUB_TOKEN` shadowing your `universe login` token (env sources outrank the stored token). Run `universe whoami` to see the active source, then re-authorize or unset the env token. Full chain and precedence: [`reference.md`](reference.md#identity).

## When something breaks

| Symptom                             | Fix                                                                                                                                                            |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Already logged in. …`              | Stored token exists. `universe logout` first, or `--force` to replace.                                                                                         |
| `Site '<slug>' is not registered …` | The error inlines a "Did you mean?" hint plus the `sites register` / `sites update` commands. Registered but no access? Ask a `staff` member to add your team. |
| `No files to deploy under <dir>`    | Output dir empty after the `deploy.ignore` filter. Check the build produced files in `build.output` (or `--dir`). Exits `GIT` (15).                            |
| Deploy id shows `nogit-…`           | Not in a git repo — git isn't required; run from inside one for a sha-stamped id.                                                                              |
| `user_unauthorized`                 | Token lacks `read:org` / SSO authorization, or a low-scope `$GITHUB_TOKEN` is shadowing your login token. `universe whoami`, then re-authorize or unset it.    |
| Wrong identity resolved             | `universe whoami` shows which source fired. Env tokens (`env_GITHUB_TOKEN`/`env_GH_TOKEN`) outrank your `device_flow` login token — unset them for that shell. |

Anything else — file an issue with `universe whoami --json` and the failing command's `--json` envelope.
