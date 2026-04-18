# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1] - 2026-04-18

Release 0.3.1

## [0.3.0] - 2026-04-15

Tier 2 hygiene release. Focuses on runtime alignment, workflow hygiene, and dependency updates. All Tier 2 findings from the adversarial review landed.

### Security

- Redaction regex extended to catch whitespace-before-separator, JSON-quoted credential values, Bearer authorization tokens, and additional AWS prefixes (ASIA, AROA, AIDA, ACCA, ANPA, ABIA, AGPA) (T2.6).
- S3 endpoint validated at credential resolution time: rejects malformed URLs, plaintext `http://` for non-localhost hosts, and URLs containing `user:pass@` userinfo (T2.5).
- Workflow permissions scoped per job: `test`/`build` get `contents: read`, `publish` adds only `id-token: write`, `release` is the only job with `contents: write` (T2.3).
- New preflight job verifies `inputs.version`, `package.json.version`, and a matching `CHANGELOG.md ## [X.Y.Z]` heading all agree before test/build/publish run. Prevents silent version drift (T2.8).

### Added

- `engines.node >= 22.11.0` in `package.json` so installs on older Node fail with a clear message.
- `description`, `keywords`, `bugs`, `homepage` fields in `package.json` for npm search visibility (T2.7).
- `.github/actions/check-version-consistency` composite action.

### Changed

- CI and SEA build matrix run on Node 24 (Active LTS since 2025-10-28). tsup target bumped to `node22` (T2.1).
- All six GitHub Actions SHAs updated: `actions/checkout` v5, `actions/setup-node` v5, `pnpm/action-setup` v5, `actions/upload-artifact` v5, `actions/download-artifact` v5, `softprops/action-gh-release` v2.4.1. Closes the Node 20 runtime deprecation warnings (T2.2).
- `pnpm` packageManager bumped to 10.33.0 (T2.4a).
- `p-limit` upgraded to v7 (T2.4b).
- `cac` upgraded to v7. Output channel changed to `console.info`, test spies updated (T2.4c).
- `zod` upgraded to v4. `.default({})` replaced with `.prefault({})` to match v4 default semantics (T2.4d).
- Zod validation errors now surface human-readable issue lists via `safeParse` instead of the raw JSON stringification that v3 `parse()` produced (T2.5).

## [0.2.0] - 2026-04-15

Tier 1 hardening release. Addresses security-critical and correctness findings from the adversarial review of 0.1.1.

### Security

- Reject symlinked directories and files whose target resolves outside the deploy output directory. Prevents `dist/link -> ~/.aws` from exfiltrating credentials to R2 (T1.4, T1.4b).
- Reject `output_dir` values in `platform.yaml` and `--output-dir` that are absolute or escape the project root (T1.4c).
- Eliminate the shell-injection vector on the `workflow_dispatch` version input by validating semver in a dedicated composite action and referencing the input through `$VERSION` env bindings instead of raw `${{ inputs.version }}` in `run:` blocks (T1.2).

### Added

- Typed error hierarchy: `CliError` abstract class with `ConfigError`, `CredentialError`, `StorageError`, `OutputDirError`, `GitError`, `AliasError`, `DeployNotFoundError`, `ConfirmError`. `handleActionError` now maps each subclass to its declared `exitCode` so CI automation can distinguish config errors (11) from credential errors (12) from storage errors (13) (T1.3a, T1.3b).
- `repository` field in `package.json` so npm provenance validation passes.

### Changed

- Upload now uses a single shared file walker (`walkFiles` in `src/deploy/walk.ts`). `preflight` and `upload` no longer disagree on which files count as deployable (T1.4b).
- `@types/node` bumped from `^20.19.39` to `^24.12.2` to match the Node 22/24 runtime, surfacing and fixing `Dirent.path` → `Dirent.parentPath` (T1.6).
- `src/cli.ts` uses static imports for command modules. Eliminates the documented Node SEA `useCodeCache` + `import()` incompatibility and drops the CJS bundle from 1.81MB to 1.56MB (T1.1).

### Fixed

- Deploy ID collision exhaust now throws `StorageError` instead of silently re-generating and potentially overwriting an active production deploy (T1.5).

## [0.1.1] - 2026-04-15

Canary release verifying the Node 24 + Trusted Publisher OIDC end-to-end publish path.

### Added

- Linux ARM64 Node SEA binary (`universe-linux-arm64`) for Raspberry Pi, AWS Graviton, and similar ARM64 hosts

### Changed

- Release notes now extracted from `CHANGELOG.md` at release time — this file is the single source of truth for release content
- CI restructured: reusable `test.yml` workflow, new `ci.yml` running on push/PR, `release.yml` calls the shared test workflow
- npm publish authenticates via Trusted Publisher OIDC — no stored token, provenance attestation on every release
- Publish job runs on Node 24 to access npm 11+ (required for Trusted Publisher OIDC credential exchange)

## [0.1.0] - 2026-04-13

### Added

- `universe static deploy` — deploy a static site to R2 with preview URLs
- `universe static promote` — promote a preview deployment to production
- `universe static rollback` — rollback production to the previous deployment
- Node SEA binaries for macOS (Apple Silicon, Intel) and Linux x64
- npm distribution via `@freecodecamp/universe-cli` package with OIDC provenance
- `--json` flag on all commands for CI integration
- `platform.yaml` based site configuration
