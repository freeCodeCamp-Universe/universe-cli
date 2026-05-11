# Deploying a Static Site

This guide walks a staff user through deploying a static site to
`*.freecode.camp` end-to-end. It targets **CLI v0.5.x** (post-pivot:
identity-only client; artemis proxy holds the R2 admin credentials).

> Authoritative contract: [Universe ADR-016 — Deploy proxy](https://github.com/freeCodeCamp-Universe/Universe/blob/main/decisions/016-deploy-proxy.md).
> Schema reference: [`platform-yaml.md`](platform-yaml.md).
> CLI surface summary: [`../README.md`](../README.md#cli-surface).

## Prerequisites

- `universe` CLI installed ([Install](../README.md#install)).
- A freeCodeCamp GitHub account that belongs to a team granted access to
  the target site (the proxy enforces team membership server-side — there
  is no per-site config in your repo).

That's it. No R2 token, no `.env` file, no `S3_*` variables.

## 1. Log in

The CLI authenticates against GitHub via OAuth device flow. One-time
setup per laptop:

```sh
universe login
```

It prints a code and a verification URL. Open the URL, paste the code,
approve. The token is stored at `~/.config/universe-cli/token` (mode
0600).

Check it worked:

```sh
universe whoami
```

This prints the resolved GitHub identity, which **slot** of the
[identity chain](#identity-sources) fired (useful when CI behaves
differently from your laptop), and the count of sites the proxy
authorizes you for. To see the actual site list:

```sh
universe sites ls --mine
```

The split is deliberate: `whoami` stays compact even when you're on
dozens of teams; the listing lives where it belongs (in `sites`).

## 2. Set up `platform.yaml`

At your repo root, the only config the CLI reads:

```yaml
site: my-site
```

`site` is the slug used by the proxy. The hostname is derived
server-side: `<site>.freecode.camp` for production, plus a separate
preview URL the proxy assigns.

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

Full field reference, validation rules, and v0.3 → v0.4 migration:
[`platform-yaml.md`](platform-yaml.md).

If your site is brand new and not yet in the registry, a staff member
with `sites register` permission needs to register the slug — see
[Staff: site registry](#staff-site-registry) below.

## 3. Build & deploy to preview

The CLI runs your build for you. Two shapes work:

- **`build.command` set in `platform.yaml`** (the common case): `universe
static deploy` shells out to that command, then uploads `build.output`.
  Don't run the build separately — the CLI handles it.
- **`build.command` unset** (CI artifact pattern): the CLI skips the build
  step and uploads whatever is already in `build.output`. Useful when your
  CI pipeline produces the artifact and `universe` just ships it.

Either way:

```sh
universe static deploy
```

On success the proxy returns a deploy id (`<timestamp>-<gitsha>`) and a
preview URL. Visit the URL to verify.

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

Lists recent deploys for the site declared in `platform.yaml`. Add
`--site <slug>` to inspect a different site you have access to.

The id format is `YYYYMMDD-HHMMSS-<gitsha>`. You'll need a specific id
to roll back.

## 5. Promote preview to production

When the preview looks good:

```sh
universe static promote
```

This re-points the production alias at the deploy id currently behind
preview. The proxy returns the new production URL.

To promote a specific past deploy (e.g. you ran a second preview and
want to push the first to prod):

```sh
universe static promote --from 20260511-091422-abc1234
```

## 6. Roll back

Roll back is an alias rewrite, not a redeploy. Pick a past deploy id
with `universe static ls`, then:

```sh
universe static rollback --to 20260427-141522-abc1234
```

The proxy points production at that deploy id. The old production deploy
remains in storage — rollback is non-destructive and reversible.

## Common scenarios

### Deploy from CI (GitHub Actions)

GitHub Actions can authenticate two ways:

1. **OIDC (preferred when artemis supports it)** — set
   `permissions: id-token: write` on the job. Currently, the proxy
   doesn't validate GHA OIDC tokens yet (see CONTRIBUTING §Internal
   conventions), so for now use option 2.
2. **`$GITHUB_TOKEN`** — pass the workflow-issued token explicitly:

   ```yaml
   - run: universe static deploy --promote --json
     env:
       GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
   ```

   `--promote` finalizes as production directly, which is the usual
   CI shape when your branch is `main`.

### Use a non-prod proxy (staging)

```sh
UNIVERSE_PROXY_URL=https://uploads.staging.freecode.camp universe static deploy
```

### Sign out from this laptop

```sh
universe logout
```

Deletes the stored token. The next `universe` invocation will need
`universe login` again (or one of the higher-priority identity slots —
e.g. `$GITHUB_TOKEN`).

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

`--team` accepts a comma-separated list and can be passed multiple
times. Teams refer to GitHub team slugs in the freeCodeCamp org.

## Identity sources

The CLI resolves a GitHub identity in this order — first match wins:

1. `$GITHUB_TOKEN` / `$GH_TOKEN`
2. GitHub Actions OIDC (proxy doesn't validate this yet — falls through)
3. Woodpecker OIDC (placeholder, deferred)
4. `gh auth token` (laptop with `gh` installed)
5. Device-flow stored token at `~/.config/universe-cli/token`

If `universe whoami` shows a different identity than expected, the most
common cause is an env var (slot 1) overriding your laptop login (slot
5). Unset `GITHUB_TOKEN` for that shell or use a fresh terminal.

## When something breaks

| Symptom                                      | Try                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Already logged in. …` from `universe login` | You already have a stored token. Run `universe logout` first, or pass `--force` to replace.                                                                                                                                                                                                                                                                                          |
| `Site '<slug>' is not registered …`          | The error body inlines the recovery: a "Did you mean?" hint if your `platform.yaml` `site:` is close to a registered slug, plus the `universe sites register …` / `universe sites update …` commands a staff member would run. If the slug is registered but you're not authorized, ask any `staff` member to add your team via `universe sites update <slug> --team=…,<your-team>`. |
| `platform.yaml v1 detected`                  | Your config still uses the pre-v0.4 schema (`name`, `r2`, `bucket`, `stack`, `domain`). See [`platform-yaml.md` §Migration](platform-yaml.md#migration-v03--v04).                                                                                                                                                                                                                    |
| `not a git repository`                       | The CLI stamps deploy ids with a git sha. Initialize git in the project, or run from inside one.                                                                                                                                                                                                                                                                                     |
| Wrong identity resolved                      | Run `universe whoami` to see which slot fired. Unset `GITHUB_TOKEN` if you didn't intend it.                                                                                                                                                                                                                                                                                         |

For anything else — file an issue with the output of
`universe whoami --json` and the failing command's `--json` envelope.

## See also

- [`../README.md`](../README.md) — install + full CLI surface + env vars
- [`platform-yaml.md`](platform-yaml.md) — `platform.yaml` schema reference
- [`RELEASING.md`](RELEASING.md) — how the CLI itself ships (maintainers)
- [ADR-016](https://github.com/freeCodeCamp-Universe/Universe/blob/main/decisions/016-deploy-proxy.md) — full CLI ↔ artemis contract
