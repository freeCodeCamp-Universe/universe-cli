# Universe CLI

Static site deployment for the freeCodeCamp Universe platform.

> v0.4 routes every deploy through the **artemis** proxy at
> `uploads.freecode.camp`. Staff hold only a `platform.yaml` and a
> GitHub identity — the proxy holds the R2 credentials. See
> [Universe ADR-016](https://github.com/freeCodeCamp-Universe/Universe/blob/main/decisions/016-deploy-proxy.md)
> for the full design.

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

Download the latest binary from [Releases](../../releases):

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

Verify:

```sh
universe --version
```

## CLI surface

Top-level (cross-cutting):

```sh
universe login            # GitHub OAuth device flow → ~/.config/universe-cli/token
universe logout           # delete stored token
universe whoami           # echo current login + authorized sites
universe --version        # CLI version
```

Static-site verbs (namespaced under `static`):

```sh
universe static deploy [--promote] [--dir <path>]
universe static promote [--from <deployId>]
universe static rollback --to <deployId>
universe static ls [--site <site>]
```

All commands support `--json` for CI integration.

## Identity (priority chain)

The CLI resolves a GitHub identity in this order — first match wins:

1. `$GITHUB_TOKEN` / `$GH_TOKEN` env (CI explicit)
2. GHA OIDC (`$ACTIONS_ID_TOKEN_REQUEST_URL` + `$ACTIONS_ID_TOKEN_REQUEST_TOKEN`)
3. Woodpecker OIDC env (deferred — placeholder slot)
4. `gh auth token` shell-out (laptop with `gh` installed)
5. Device-flow stored token at `~/.config/universe-cli/token`

The proxy validates whatever it receives via GitHub `GET /user`, then
authorizes against the `sites.yaml` map server-side. Run
`universe whoami` to see which slot resolved.

## Configuration (`platform.yaml`)

Every site has a `platform.yaml` at its repo root. Minimal valid file:

```yaml
site: my-site
```

Full reference (every field, defaults, validation rules, v0.3 → v0.4
migration): [`docs/platform-yaml.md`](docs/platform-yaml.md).

No credential fields. The proxy holds the R2 admin key; the CLI never
reads or writes one.

## Common flows

```sh
# 1. Authenticate (laptop, first time)
universe login

# 2. Deploy to preview
universe static deploy

# 3. Inspect identity + authorized sites
universe whoami

# 4. List recent deploys for the current site
universe static ls

# 5. Promote current preview to production
universe static promote

# 6. Roll production back to a past deploy
universe static rollback --to 20260427-141522-abc1234
```

CI (GitHub Actions) — set `permissions: id-token: write` and rely on
slot 2 (GHA OIDC) of the identity chain, or pass `$GITHUB_TOKEN`
explicitly.

## Environment overrides

| Env                         | Default                         | Purpose                            |
| --------------------------- | ------------------------------- | ---------------------------------- |
| `UNIVERSE_PROXY_URL`        | `https://uploads.freecode.camp` | Override proxy host (staging etc.) |
| `UNIVERSE_GH_CLIENT_ID`     | —                               | GitHub OAuth App id (`login` only) |
| `GITHUB_TOKEN` / `GH_TOKEN` | —                               | Slot 1 of identity chain           |

## Development

```sh
pnpm install
pnpm test          # vitest
pnpm typecheck     # tsc --noEmit
pnpm lint          # oxlint
pnpm build         # tsup → dist/
```

## Releasing

See [docs/RELEASING.md](docs/RELEASING.md).
