# Releasing

For release maintainers cutting a new `@freecodecamp/universe-cli` version. Build / test commands and pre-commit gates live in [`README.md`](README.md) under "Build & test".

Releases are automated with [release-please](https://github.com/googleapis/release-please). You never pick a version or edit the changelog by hand — release-please derives both from Conventional Commits and keeps a standing **Release PR** open. Cutting a release = **merging that PR**.

## Prerequisites

- **npm Trusted Publisher** — the `@freecodecamp/universe-cli` package on npm must have GitHub Actions configured as a trusted publisher (Owner: `freeCodeCamp-Universe`, Repository: `universe-cli`, Workflow: `release.yml`). Configure at https://www.npmjs.com/package/@freecodecamp/universe-cli/access. **Do not rename `release.yml`** — the binding is by workflow filename; renaming breaks publishing.
- No npm token is required — the workflow authenticates via OIDC, and provenance attestations are generated automatically.

## Cut a release

1. Land your `feat:` / `fix:` commits on `main` using Conventional Commits (see table below).
1. release-please keeps a **Release PR** open — titled `chore(main): release X.Y.Z` — carrying the computed version bump (`package.json`) and the generated `CHANGELOG.md`. It refreshes on every push to `main`.
1. When ready to ship, **review and merge the Release PR**.
1. On merge, release-please tags `vX.Y.Z` + creates the GitHub Release, then the same workflow tests, builds binaries, publishes to npm, and attaches the binaries.

There are no `version` / `bump` inputs — the version is computed from commit types:

| Commit type                                | Bump            | Example                  |
| ------------------------------------------ | --------------- | ------------------------ |
| `fix:`                                     | patch           | `0.8.0` → `0.8.1`        |
| `feat:`                                    | minor           | `0.8.1` → `0.9.0`        |
| `feat!:` / `BREAKING CHANGE:`              | minor (pre-1.0) | breaking stays 0.x minor |
| `chore:` / `docs:` / `refactor:` / `test:` | none            | no release               |

> **Pre-1.0:** `bump-minor-pre-major: true` (in [`release-please-config.json`](../release-please-config.json)) bumps the **minor** on a breaking change, not the major — a stray `feat!` can't jump us to `1.0.0`. Cut `1.0.0` deliberately with a `Release-As: 1.0.0` commit footer once the API is stable.

> **Prereleases** (`-rc` / `-beta`) are **not** part of this flow. If one is ever needed, use a `Release-As: X.Y.Z-rc.1` commit footer.

## What the workflow does (`release.yml`)

1. **release-please** — reads Conventional Commits on `main`, maintains the Release PR. On merge: tags `vX.Y.Z`, creates the GitHub Release, sets `release_created`.
1. **test** *(gated on `release_created`)* — reusable `test.yml`: `pnpm vitest run` + `pnpm tsc --noEmit`.
1. **build** *(gated)* — matrix builds Node SEA binaries for four platforms (see below) at the tagged commit.
1. **publish** *(gated)* — `npm publish --provenance --access public --tag latest` via Trusted Publisher OIDC, **inline** in this workflow (the OIDC subject must be `release.yml`).
1. **upload** *(gated)* — `gh release upload` attaches the binaries + SHA256 checksums to the GitHub Release.

Every post-release job is gated on `needs.release-please.outputs.release_created == 'true'` and runs in this single workflow — no tag-triggered second workflow, so no PAT is needed (a `GITHUB_TOKEN`-created tag cannot trigger a downstream workflow).

## Binaries

| Platform            | Binary                  |
| ------------------- | ----------------------- |
| macOS Apple Silicon | `universe-darwin-arm64` |
| macOS Intel         | `universe-darwin-amd64` |
| Linux x64           | `universe-linux-amd64`  |
| Linux ARM64         | `universe-linux-arm64`  |

Each binary is a Node SEA (Single Executable Application) — no Node.js install required at runtime. macOS binaries are ad-hoc codesigned. The workflow produces and attaches them automatically on release; npm publish via Trusted Publisher only works inside GitHub Actions.
