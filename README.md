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

## Usage

```sh
# Deploy a static site (from a directory with platform.yaml and a built dist/)
universe static deploy

# Deploy without git metadata
universe static deploy --force

# Deploy a non-default build output directory
universe static deploy --output-dir build

# Promote preview to production
universe static promote

# Promote a specific deploy
universe static promote 20260413-120000-abc1234

# Rollback production to previous deploy
universe static rollback --confirm
```

All commands support `--json` for CI integration. In JSON mode, `rollback` also requires `--confirm`.

## Configuration (`platform.yaml`)

Every site has a `platform.yaml` at its repo root. Minimal valid file:

```yaml
site: my-site
```

Full reference (every field, defaults, validation rules, v0.3 → v0.4
migration): [`docs/platform-yaml.md`](docs/platform-yaml.md).

## Credentials

The CLI needs R2 credentials. See the [Staff Guide](docs/STAFF-GUIDE.md#2-credentials) for setup.

## Development

```sh
pnpm install
pnpm vitest run    # 180 tests
pnpm tsup          # build to dist/
pnpm tsc --noEmit  # typecheck
```

## Releasing

See [RELEASING.md](docs/RELEASING.md).
