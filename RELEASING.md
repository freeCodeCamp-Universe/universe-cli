# Releasing

Releases are manual — you decide when to cut one.

## Prerequisites

- **npm Trusted Publisher** — the `universe-cli` package on npm must have GitHub Actions configured as a trusted publisher (Owner: `freeCodeCamp-Universe`, Repository: `universe-cli`, Workflow: `release.yml`). Configure at https://www.npmjs.com/package/universe-cli/access.

No npm token is required — the workflow authenticates via OIDC token exchange.

## How to Release

1. Go to **Actions** > **Release** > **Run workflow**
2. Enter the version (e.g., `0.2.0`)
3. Click **Run workflow**

That's it. The workflow:

- Runs tests (180/180) and typecheck
- Builds Node SEA binaries for 3 platforms
- Signs macOS binaries
- Creates a git tag `v0.2.0`
- Publishes a GitHub Release with binaries + SHA256 checksums
- Publishes to npm with OIDC provenance attestation

## Binaries

| Platform            | Binary                  |
| ------------------- | ----------------------- |
| macOS Apple Silicon | `universe-darwin-arm64` |
| macOS Intel         | `universe-darwin-amd64` |
| Linux x64           | `universe-linux-amd64`  |

Each binary is a Node SEA (Single Executable Application) — no Node.js install required.

## Local Tag (escape hatch)

If GitHub Actions is unavailable:

```sh
git tag v0.2.0
git push origin v0.2.0
```

Then manually build and attach binaries to the GitHub Release.
