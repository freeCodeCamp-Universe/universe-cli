# Releasing

For release maintainers cutting a new `@freecodecamp/universe-cli` version. Build / test commands and pre-commit gates live in [`README.md`](README.md) under "Build & test".

Releases are manual — trigger the workflow when ready. Patch versions auto-increment from `package.json`; feature and major bumps require operator input.

## Prerequisites

- **npm Trusted Publisher** — the `@freecodecamp/universe-cli` package on npm must have GitHub Actions configured as a trusted publisher (Owner: `freeCodeCamp-Universe`, Repository: `universe-cli`, Workflow: `release.yml`). Configure at https://www.npmjs.com/package/@freecodecamp/universe-cli/access.
- No npm token is required — the workflow authenticates via OIDC.

## Cut a release

Go to **Actions** → **Release** → **Run workflow**. The form has three inputs:

| Input     | When to set it                                                                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `version` | Set for explicit cuts — e.g. `0.6.0` for a minor, `1.0.0` for a major, or `0.6.0-rc.1` for a prerelease. Leave **empty** to derive from `bump`.      |
| `bump`    | Only used when `version` is empty. `auto-patch` (default) increments the current package.json patch by 1. `minor` / `major` zero the lower segments. |
| `notes`   | Optional. Markdown that becomes the body of the auto-inserted CHANGELOG section. Leave empty to auto-generate the body from commits via `git-cliff`. |

Common patterns:

- **Patch (e.g. `0.5.0` → `0.5.1`)** — leave everything default. Click Run workflow.
- **Minor (e.g. `0.5.x` → `0.6.0`)** — set `bump=minor`, leave `version` empty.
- **Major (e.g. `0.x.y` → `1.0.0`)** — set `bump=major`, leave `version` empty.
- **Prerelease / explicit version** — type the full version (e.g. `1.0.0-rc.1`) into `version`. The `bump` input is ignored.
- **Hand-written release notes** — paste markdown into `notes`. It replaces the auto-generated changelog body for that release only.

The CHANGELOG section is generated from Conventional Commits since the last `v*` tag (see [`cliff.toml`](../cliff.toml) for the parser map). Releases with no `feat:` / `fix:` commits get a generic "Maintenance release" body — override with the `notes` input if you want something specific.

## What the workflow does

1. **preflight** — resolves the final version (from `version` or `bump + package.json`) and validates the semver shape.
1. **bump** — updates `package.json`, renders the new CHANGELOG section (via `git-cliff` or `notes`), commits as `chore: release vX.Y.Z`, pushes to `main`.
1. **test** — reusable `test.yml` runs `pnpm vitest run` + `pnpm tsc --noEmit`.
1. **build** — matrix builds Node SEA binaries for four platforms (see below).
1. **publish** — `npm publish --provenance` via Trusted Publisher OIDC. Dist-tag derived from the version: `alpha` / `beta` / `next` for prereleases, `latest` for stable.
1. **release** — git-tags `vX.Y.Z`, extracts the new CHANGELOG section as the release body, and uploads binaries + SHA256 checksums to the GitHub Release. Prereleases are flagged so they don't shadow `latest`.

## Binaries

| Platform            | Binary                  |
| ------------------- | ----------------------- |
| macOS Apple Silicon | `universe-darwin-arm64` |
| macOS Intel         | `universe-darwin-amd64` |
| Linux x64           | `universe-linux-amd64`  |
| Linux ARM64         | `universe-linux-arm64`  |

Each binary is a Node SEA (Single Executable Application) — no Node.js install required at runtime. macOS binaries are ad-hoc codesigned.

Then build locally (`pnpm build` then the SEA steps from `release.yml`) and attach the binaries to the GitHub Release by hand. npm publish via Trusted Publisher will not work outside Actions — defer to the next time the workflow runs.
