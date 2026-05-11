# Releasing

Releases are manual — you decide when to cut one.

## Developing

```sh
pnpm install
pnpm lint          # oxlint
pnpm test          # vitest run
pnpm tsc --noEmit  # typecheck
pnpm build         # tsup → dist/
```

## Prerequisites

- **npm Trusted Publisher** — the `@freecodecamp/universe-cli` package on npm must have GitHub Actions configured as a trusted publisher (Owner: `freeCodeCamp-Universe`, Repository: `universe-cli`, Workflow: `release.yml`). Configure at https://www.npmjs.com/package/@freecodecamp/universe-cli/access.

No npm token is required — the workflow authenticates via OIDC token exchange.

## How to Release

1. Optional: pre-write a `## [X.Y.Z] - YYYY-MM-DD` section in `CHANGELOG.md`. If you skip this, the workflow auto-inserts a section using the `notes` input (or `Release X.Y.Z` as a fallback when `notes` is empty).
1. Go to **Actions** > **Release** > **Run workflow**.
1. Enter the **version** (e.g., `0.2.0`).
1. Optionally paste markdown into **notes** — becomes the body of the auto-inserted CHANGELOG section. Skip if step 1 already covered it.
1. Click **Run workflow**.

The workflow:

- Runs tests and typecheck (via reusable `test.yml`)
- Builds Node SEA binaries for 4 platforms
- Signs macOS binaries
- Publishes to npm with OIDC provenance (via Trusted Publisher)
- Creates a git tag `v0.2.0` and a GitHub Release with binaries + SHA256 checksums

## Binaries

| Platform            | Binary                  |
| ------------------- | ----------------------- |
| macOS Apple Silicon | `universe-darwin-arm64` |
| macOS Intel         | `universe-darwin-amd64` |
| Linux x64           | `universe-linux-amd64`  |
| Linux ARM64         | `universe-linux-arm64`  |

Each binary is a Node SEA (Single Executable Application) — no Node.js install required.

## Local Tag (escape hatch)

If GitHub Actions is unavailable:

```sh
git tag v0.2.0
git push origin v0.2.0
```

Then manually build and attach binaries to the GitHub Release.
