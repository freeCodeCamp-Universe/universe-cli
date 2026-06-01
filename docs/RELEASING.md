# Releasing

Cutting a new `@freecodecamp/universe-cli` version. Releases are automated with [release-please](https://github.com/googleapis/release-please): you never pick a version or edit the changelog by hand — it derives both from Conventional Commits and keeps a standing **Release PR** open. Cutting a release means **merging that PR**. Repo layout and build commands: [`README.md`](README.md).

## Prerequisites

| Requirement                 | Detail                                                                                                                                                                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm Trusted Publisher       | The package must have GitHub Actions set as a trusted publisher — Owner `freeCodeCamp-Universe`, Repo `universe-cli`, Workflow `release.yml`. Configure at <https://www.npmjs.com/package/@freecodecamp/universe-cli/access>. |
| No NPM_TOKEN                | The workflow authenticates via OIDC; provenance attestations are automatic. No npm token is required or stored.                                                                                                               |
| Do not rename `release.yml` | The Trusted Publisher binding is by workflow filename. Renaming it breaks publishing.                                                                                                                                         |

## Cut a release

1. Land `feat:` / `fix:` commits on `main` (Conventional Commits; see the bump table).
1. release-please keeps a **Release PR** open — `chore(main): release X.Y.Z` — carrying the computed version bump (`package.json`) and generated `CHANGELOG.md`, refreshed on every push to `main`.
1. Review and merge the Release PR.
1. On merge, release-please tags `vX.Y.Z` and creates the GitHub Release; the same workflow then tests, builds binaries, publishes to npm, and attaches the binaries.

| Commit type                                | Bump            | Example                    |
| ------------------------------------------ | --------------- | -------------------------- |
| `fix:`                                     | patch           | `0.8.0` → `0.8.1`          |
| `feat:`                                    | minor           | `0.8.1` → `0.9.0`          |
| `feat!:` / `BREAKING CHANGE:`              | minor (pre-1.0) | breaking stays a 0.x minor |
| `chore:` / `docs:` / `refactor:` / `test:` | none            | no release                 |

> **Pre-1.0:** `bump-minor-pre-major: true` in [`../release-please-config.json`](../release-please-config.json) bumps the **minor** on a breaking change, not the major — a stray `feat!` can't jump to `1.0.0`. Cut `1.0.0` deliberately with a `Release-As: 1.0.0` footer once the API is stable.
>
> **Prereleases** (`-rc` / `-beta`) aren't part of this flow; if needed, use a `Release-As: X.Y.Z-rc.1` footer.

## What `release.yml` does

Every post-release job is gated on `needs.release-please.outputs.release_created == 'true'` in this single workflow. No tag-triggered second workflow, so no PAT is needed — a `GITHUB_TOKEN`-created tag cannot trigger a downstream workflow.

| Job            | Gate              | Action                                                                                                                   |
| -------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| release-please | always            | Reads commits on `main`, maintains the Release PR. On merge: tags `vX.Y.Z`, creates the Release, sets `release_created`. |
| test           | `release_created` | Reusable `test.yml`: `pnpm vitest run` + `pnpm tsc --noEmit`.                                                            |
| build          | `release_created` | Matrix-builds Node SEA binaries for four platforms at the tagged commit.                                                 |
| publish        | `release_created` | `npm publish --provenance --access public --tag latest` via Trusted Publisher OIDC (subject must be `release.yml`).      |
| upload         | `release_created` | `gh release upload` attaches the binaries + SHA256 checksums to the Release.                                             |

## Binaries

| Platform            | Binary                  |
| ------------------- | ----------------------- |
| macOS Apple Silicon | `universe-darwin-arm64` |
| macOS Intel         | `universe-darwin-amd64` |
| Linux x64           | `universe-linux-amd64`  |
| Linux ARM64         | `universe-linux-arm64`  |

Each binary is a Node SEA — no Node.js install required at runtime. macOS binaries are ad-hoc codesigned. npm publish via Trusted Publisher only works inside GitHub Actions.
