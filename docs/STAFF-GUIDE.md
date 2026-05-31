# Universe CLI — Staff Guide

Staff walkthrough for the freeCodeCamp Universe platform. The numbered steps below deploy a static site to `*.freecode.camp` end-to-end; later sections cover the [site registry](#site-registry) and [repository creation](#creating-a-repository). Schema: [`platform-yaml.md`](platform-yaml.md). Architecture, ADR-016, runbooks, internal conventions: [`README.md`](README.md).

## Prerequisites

- `universe` CLI installed ([Install](../README.md#install)).
- A GitHub account that is a member of the `freeCodeCamp-Universe` org and belongs to a team granted access to the target site (the proxy enforces team membership server-side — there is no per-site config in your repo).

That's it. No R2 token, no `.env` file, no `S3_*` variables.

## 1. Log in

The CLI authenticates against GitHub via OAuth device flow. One-time setup per laptop:

```sh
universe login
```

It prints a code and a verification URL. Open the URL, paste the code, approve. The token is stored at `~/.config/universe-cli/token` (mode 0600).

Check it worked:

```sh
universe whoami
```

This prints the resolved GitHub identity, which **slot** of the identity chain fired (useful when CI behaves differently from your laptop — see [`../README.md#identity-priority-chain`](../README.md#identity-priority-chain)), and the count of sites the proxy authorizes you for. To see the actual site list:

```sh
universe sites ls --mine
```

The split is deliberate: `whoami` stays compact even when you're on dozens of teams; the listing lives where it belongs (in `sites`).

## 2. Set up `platform.yaml`

At your repo root, the only config the CLI reads:

```yaml
site: my-site
```

`site` is the slug used by the proxy. The hostname is derived server-side: `<site>.freecode.camp` for production, plus a separate preview URL the proxy assigns.

A typical build-and-ignore example:

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

Full field reference and validation rules: [`platform-yaml.md`](platform-yaml.md).

If your site is brand new and not yet in the registry, a staff member with `sites register` permission needs to register the slug — see [Site registry](#site-registry) below.

## 3. Build & deploy to preview

The CLI runs your build for you. Two shapes work:

- **`build.command` set in `platform.yaml`** (the common case): `universe static deploy` shells out to that command, then uploads `build.output`. Don't run the build separately — the CLI handles it.
- **`build.command` unset** (CI artifact pattern): the CLI skips the build step and uploads whatever is already in `build.output`. Useful when your CI pipeline produces the artifact and `universe` just ships it.

Either way:

```sh
universe static deploy
```

On success the proxy returns a deploy id (`<timestamp>-<gitsha>`) and a preview URL. Visit the URL to verify.

Useful flags:

| Flag           | Effect                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `--dir <path>` | Upload from `<path>` instead of `build.output`. Use when your build pipeline outputs somewhere ad-hoc.                         |
| `--promote`    | Finalize as **production** in a single step (skip the preview → promote dance). Reserve for emergencies or fully automated CI. |
| `--json`       | Machine-readable envelope; required for CI.                                                                                    |

## 4. Inspect what's deployed

```sh
universe static ls
```

Lists recent deploys for the site declared in `platform.yaml`. Add `--site <slug>` to inspect a different site you have access to.

The id format is `YYYYMMDD-HHMMSS-<gitsha>`. You'll need a specific id to roll back.

## 5. Promote preview to production

When the preview looks good:

```sh
universe static promote
```

This re-points the production alias at the deploy id currently behind preview. The proxy returns the new production URL.

To promote a specific past deploy (e.g. you ran a second preview and want to push the first to prod):

```sh
universe static promote --from 20260511-091422-abc1234
```

## 6. Roll back

Roll back is an alias rewrite, not a redeploy. Pick a past deploy id with `universe static ls`, then:

```sh
universe static rollback --to 20260427-141522-abc1234
```

The proxy points production at that deploy id. The old production deploy remains in storage — rollback is non-destructive and reversible.

## Common scenarios

### Deploy from CI (GitHub Actions)

Pass `$GITHUB_TOKEN` explicitly — it's slot 1 of the identity chain:

```yaml
- run: universe static deploy --promote --json
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

`--promote` finalizes as production directly — the usual CI shape on `main`.

### Use a non-prod proxy (staging)

```sh
UNIVERSE_PROXY_URL=https://uploads.staging.freecode.camp universe static deploy
```

### Sign out from this laptop

```sh
universe logout
```

Deletes the stored token. The next `universe` invocation will need `universe login` again (or one of the higher-priority identity slots — e.g. `$GITHUB_TOKEN`).

## Site registry

```sh
universe sites ls                                       # list every registered site (any GitHub user)
universe sites ls --mine                                # filter to sites your identity is authorized for
```

Mutation commands require staff-level authorization at the proxy:

```sh
universe sites register <slug>                          # register a new site (defaults team to "staff")
universe sites register <slug> --team=news-editors      # register with a specific team
universe sites update <slug> --team=staff,news-editors  # replace the teams list
universe sites rm <slug>                                # delete entry (R2 bytes age out via cron)
```

`--team` accepts a comma-separated list and can be passed multiple times. Teams refer to GitHub team slugs in the `freeCodeCamp-Universe` org.

## Creating a repository

Staff can request a new repository in the `freeCodeCamp-Universe` org. The request enters an approval queue; an admin approves it, and the proxy creates the repo via the Apollo-11 GitHub App. (This replaces the old Google Chat / Windmill flow — same outcome, run from your terminal.)

### Request a repo (staff)

Run it interactively — the CLI prompts for name, visibility, description, and an optional template:

```sh
universe repo create
```

Or pass everything as flags (also the CI / non-interactive form — `--yes` skips the confirmation):

```sh
universe repo create learn-python-rpg --visibility private --template hello-universe --yes
```

- **Name** — starts with a letter or digit, then letters, digits, `.`, `_`, `-` (≤100 chars).
- **Visibility** — `private` (default) or `public`.
- **Template** — an org template repo to generate from; omit for a blank repo. The interactive picker lists the templates the App can actually clone; if that list can't be fetched it falls back to free-text.

The request is queued as `pending`. Track it:

```sh
universe repo ls                 # your view of the pending queue
universe repo ls --mine          # only the requests you submitted
universe repo status <id>        # one request's full lifecycle state
```

### Approve or reject (admin)

Admins (a dedicated GitHub team in the org) resolve pending requests. Approval creates the repo synchronously, so you see the outcome inline:

```sh
universe repo ls --status pending
universe repo approve <id>                 # confirms, then creates the repo via the Apollo-11 App
universe repo reject <id> --reason "out of scope"
```

If GitHub creation fails after approval (e.g. the App lacks `Contents:read` on a template), the command reports `approved, but repository creation failed` with the error and exits non-zero — the request shows `failed` and its name is freed for a retry. A request another admin already resolved returns *already resolved* (no double-creation).

### Scripting (`--json`)

Every repo subcommand accepts `--json` (structured envelope on **stdout**; human-readable errors go to **stderr**, so `… --json | jq` stays clean). `--yes` skips the confirm prompt and is required in a non-TTY/CI session. A create → approve flow:

```sh
id=$(universe repo create my-app --visibility private --yes --json | jq -r .id)
universe repo approve "$id" --yes --json
```

On failure the envelope is `{"success":false,"error":{"code":<exit>,"kind":"<machine code>","requestId":"<id>"},…}`: `error.kind` is the stable artemis label (e.g. `user_unauthorized`) and `error.requestId`, when present, is the server correlation id to quote in a support request. Exit codes a script will see:

| Code | Meaning                                        |
| ---- | ---------------------------------------------- |
| 0    | success                                        |
| 10   | usage / your input (bad flag, 400 / 404 / 409) |
| 12   | re-authenticate (401 / 403)                    |
| 13   | server or network (5xx, timeout, 422)          |
| 18   | confirmation declined                          |

## When something breaks

| Symptom                                      | Try                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Already logged in. …` from `universe login` | You already have a stored token. Run `universe logout` first, or pass `--force` to replace.                                                                                                                                                                                                                                                                                          |
| `Site '<slug>' is not registered …`          | The error body inlines the recovery: a "Did you mean?" hint if your `platform.yaml` `site:` is close to a registered slug, plus the `universe sites register …` / `universe sites update …` commands a staff member would run. If the slug is registered but you're not authorized, ask any `staff` member to add your team via `universe sites update <slug> --team=…,<your-team>`. |
| `not a git repository`                       | The CLI stamps deploy ids with a git sha. Initialize git in the project, or run from inside one.                                                                                                                                                                                                                                                                                     |
| Wrong identity resolved                      | Run `universe whoami` to see which slot fired. Unset `GITHUB_TOKEN` if you didn't intend it.                                                                                                                                                                                                                                                                                         |

If `universe whoami` shows a different identity than expected, the most common cause is an env var (slot 1) overriding your `universe login` (slot 2). Unset `GITHUB_TOKEN` for that shell or use a fresh terminal.

For anything else — file an issue with the output of `universe whoami --json` and the failing command's `--json` envelope.
