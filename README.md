# Universe CLI

Static site deployment for the freeCodeCamp Universe platform.

## Install

### npm

```sh
# Run directly
npx @freecodecamp/universe-cli <command>

# Or install globally
npm install -g @freecodecamp/universe-cli
universe <command>
```

### Binary

<details>
  <summary>
    Download the latest binary from [Releases](../../releases):
  </summary>

```sh
  # macOS (Apple Silicon)
  gh release download --repo freeCodeCamp-Universe/universe-cli --pattern "universe-darwin-arm64"
  chmod +x universe-darwin-arm64
  sudo mv universe-darwin-arm64 /usr/local/bin/universe

  # macOS (Intel)
  gh release download --repo freeCodeCamp-Universe/universe-cli --pattern "universe-darwin-amd64"
  chmod +x universe-darwin-amd64
  sudo mv universe-darwin-amd64 /usr/local/bin/universe

  # Linux x64
  gh release download --repo freeCodeCamp-Universe/universe-cli --pattern "universe-linux-amd64"
  chmod +x universe-linux-amd64
  sudo mv universe-linux-amd64 /usr/local/bin/universe

  # Linux ARM64
  gh release download --repo freeCodeCamp-Universe/universe-cli --pattern "universe-linux-arm64"
  chmod +x universe-linux-arm64
  sudo mv universe-linux-arm64 /usr/local/bin/universe
```

</details>

Verify:

```sh
universe --version
```

## CLI surface

Top-level (cross-cutting):

```sh
universe login            # GitHub OAuth device flow → ~/.config/universe-cli/token
universe logout           # delete stored token
universe whoami           # echo current login + authorized-sites count
universe --version        # CLI version
```

Static-site verbs (namespaced under `static`):

```sh
universe static deploy [--promote] [--dir <path>]
universe static promote [--from <deployId>]
universe static rollback --to <deployId>
universe static ls [--site <site>]
```

Static-app registry (namespaced under `sites`, staff-gated writes):

```sh
universe sites ls [--mine]                          # list registered sites; `--mine` filters to your authorized set
universe sites register <slug> [--team=<name>...]   # create new entry (staff; defaults --team to staff)
universe sites update <slug> --team=<name>...       # replace teams list (staff)
universe sites rm <slug>                            # delete entry (staff; R2 deploy bytes untouched)
```

All commands support `--json` for CI integration.

## Identity (priority chain)

The CLI resolves a GitHub identity in this order — first match wins:

1. `$GITHUB_TOKEN` / `$GH_TOKEN` env (CI explicit)
1. GHA OIDC (`$ACTIONS_ID_TOKEN_REQUEST_URL` + `$ACTIONS_ID_TOKEN_REQUEST_TOKEN`)
1. Woodpecker OIDC env (deferred — placeholder slot)
1. `gh auth token` shell-out (laptop with `gh` installed)
1. Device-flow stored token at `~/.config/universe-cli/token`

The proxy validates whatever it receives via GitHub `GET /user`, then authorizes against the registry server-side (Valkey-backed; the `sites_yaml` backend was retired in artemis `f115198`). Run `universe whoami` to see which slot resolved; inspect the sites you can deploy to with `universe sites ls --mine`.

## Configuration (`platform.yaml`)

Every site has a `platform.yaml` at its repo root. Minimal valid file:

```yaml
site: my-site
```

Full schema reference (every field, defaults, validation rules): [`docs/platform-yaml.md`](docs/platform-yaml.md).

No credential fields. The proxy holds the R2 admin key; the CLI never reads or writes one.

## Common flows

Staff onboarding + deploy lifecycle:

```sh
# 1. Authenticate (laptop, first time)
universe login

# 2. Identity + how many sites you can deploy to
universe whoami

# 3. List your authorized sites (intersects registry with your GH teams)
universe sites ls --mine

# 4. From your site repo: deploy to preview (reads ./platform.yaml)
universe static deploy

# 5. Inspect recent deploys for the current site
universe static ls

# 6. Promote preview to production
universe static promote

# 7. Roll production back to a past deploy
universe static rollback --to 20260427-141522-abc1234
```

Registry admin (staff team only — gated server-side by artemis's `REGISTRY_AUTHZ_TEAM`, default `staff`):

```sh
# Register a new site (defaults --team to staff)
universe sites register hello-universe --team bots,staff

# Add or replace the teams list on an existing site
universe sites update hello-universe --team bots,staff,curriculum

# Delete a site from the registry (R2 bytes age out via cleanup cron)
universe sites rm hello-universe
```

CI (GitHub Actions) — set `permissions: id-token: write` and rely on slot 2 (GHA OIDC) of the identity chain, or pass `$GITHUB_TOKEN` explicitly. Full operator walkthrough: [`docs/STAFF-GUIDE.md`](docs/STAFF-GUIDE.md).

## Environment overrides

| Env                         | Default                          | Purpose                                                   |
| --------------------------- | -------------------------------- | --------------------------------------------------------- |
| `UNIVERSE_PROXY_URL`        | `https://uploads.freecode.camp`  | Override proxy host (staging etc.)                        |
| `UNIVERSE_GH_CLIENT_ID`     | _baked-in freeCodeCamp OAuth id_ | Override GitHub OAuth App id (fork tenants, `login` only) |
| `GITHUB_TOKEN` / `GH_TOKEN` | —                                | Slot 1 of identity chain                                  |

The shipped binary embeds the `freeCodeCamp` GitHub OAuth App client id (public; device flow uses no `client_secret`), so `universe login` works out of the box for staff. Fork operators and self-hosted mirror tenants set `UNIVERSE_GH_CLIENT_ID` to their own OAuth App's id — env value wins when set.
