# Universe CLI

Static site deployment for the freeCodeCamp Universe platform.

## Install

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

# Linux
gh release download --repo freeCodeCamp-Universe/universe-cli --pattern "universe-linux-amd64"
chmod +x universe-linux-amd64
sudo mv universe-linux-amd64 /usr/local/bin/universe
```

Verify:

```sh
universe --version
```

## Usage

```sh
# Deploy a static site (from a directory with platform.yaml and a built dist/)
universe static deploy

# Promote preview to production
universe static promote

# Rollback production to previous deploy
universe static rollback --confirm
```

All commands support `--json` for CI integration.

## Credentials

The CLI needs S3 credentials for the R2 bucket. See the [Flight Manual](docs/FLIGHT-MANUAL.md#credential-setup) for setup.

## Development

```sh
pnpm install
pnpm vitest run    # 180 tests
pnpm tsup          # build to dist/
pnpm tsc --noEmit  # typecheck
```

## Releasing

See [RELEASING.md](RELEASING.md).
