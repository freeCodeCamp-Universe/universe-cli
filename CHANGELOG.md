# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- End-to-end test suite covering all 11 CLI verbs against a local fake-artemis fixture. Two layers under `tests/e2e/`: in-process command-handler tests with the real `proxy-client` (sequence + behavior coverage) and a spawned-binary smoke matrix (cac dispatch + tsup-output regression guard). See `docs/README.md` §Internal conventions for extension notes.
- Opt-in real-artemis smoke via `pnpm test:smoke` (`tests/e2e/smoke-real-artemis.test.ts`). Gated on `UNIVERSE_E2E_REAL=1`; reads `UNIVERSE_REAL_TOKEN` and `UNIVERSE_REAL_SITE` from env. Asserts the production-alias closed loop by fetching the public URL post-deploy and matching a freshly-deployed marker — the diagnostic test for "sites not updating" reports.

### Fixed

- `static deploy --json` no longer prints the build-skipped notice or the git-dirty warning to stdout. Both `info()` and `warn()` are now gated behind `!options.json`, so machine consumers can parse stdout as a single JSON document.
- `static ls` now returns deploys newest-first. Previously artemis returned the list lexicographically ascending and the CLI did not re-sort, so the top of the list was always the OLDEST deploy. Operators reading `ls` after a successful deploy saw a stale top entry and reasonably concluded that the deploy had not landed — the most likely root cause of the "sites are not updating" reports. The CLI now sorts descending by deployId regardless of server order.



## [0.6.0] - 2026-05-13


### Added

- pre-flight getAlias + CAS expectedCurrent (rollback)
- surface 409 alias_drift + one-shot retry (promote)
- pre-flight getAlias + body-pin POST (promote)
- extend promote/rollback schema + AliasDriftError (client)
- add getAlias() to proxy-client (client)


### Fixed

- widen DEPLOY_ID_RE to server parity (client)



## [0.5.1] - 2026-05-13


### Fixed

- warn on prod-only alias divergence (static)
- pin --from <id> in preview next-hint (deploy)
- sort deploys newest-first (ls)
- silence info+warn under --json (B2) (deploy)



## [0.5.0] - 2026-05-11

Static-apps registry consumer + output UX hardening. The artemis proxy gained four new endpoints (`POST /api/site/register`, `GET /api/sites`, `PATCH /api/site/{slug}`, `DELETE /api/site/{slug}`) replacing the git-tracked `artemis/config/sites.yaml` ops loop with a Valkey-backed registry. This release wires the CLI to those endpoints and fixes two v0.4-era output bugs surfaced during smoke testing.

This is a non-breaking release for the v0.4 happy paths. The `whoami` envelope shape changed — see **Changed** below if you parse it in CI.

### Added

- `universe sites <subcommand>` namespace — distinct from the existing per-site `universe ls` (which lists deploys), this lists / mutates the registry of every static site.
  - `universe sites register <slug> [--team=<name>...]` — POST `/api/site/register`. `--team` accepts repeated flags or comma-separated values; omitted → server defaults to `[RegistryAuthzTeam]` (typically `staff`). Staff-only.
  - `universe sites ls [--json] [--mine]` — GET `/api/sites`. Open to any GitHub bearer (no special team membership required). Renders a plain text table (slug / teams / created-by / created-at) or a `{count, scope, sites[]}` JSON envelope. `--mine` intersects with the caller's authorized sites (client-side filter against `/api/whoami`) for "what can I deploy" queries that don't dump the full org-wide registry.
  - `universe sites update <slug> --team=<name>...` — PATCH `/api/site/{slug}`. `--team` is required with at least one entry; CLI rejects empty with `EXIT_USAGE` before round-tripping. Staff only.
  - `universe sites rm <slug>` — DELETE `/api/site/{slug}`. R2 deploy bytes are NOT touched (post-GA cleanup cron handles that). Staff only.
- `src/lib/proxy-client.ts` — four typed methods (`registerSite`, `listSites`, `updateSite`, `deleteSite`) mirroring the artemis Go handler shapes. Exports `SiteRow` (slug, teams, createdAt, updatedAt, createdBy) — the canonical wire shape returned by register / list / update.
- `src/commands/sites/_shared.ts` — `parseTeamsFlag` helper, identity resolution, and shared `SitesCommandDeps` interface so all four commands share one wiring pattern.

### Changed

- **`whoami` envelope no longer enumerates `authorizedSites`.** The JSON envelope now exposes `authorizedSitesCount` (number) instead of `authorizedSites` (array); the pretty output prints the count plus a pointer to `universe sites ls --mine`. Inlining the full list does not scale to staff who belong to dozens of teams. **JSON consumers reading the old `authorizedSites` array must switch to `sites ls --mine --json`.**
- **Deploy preflight error** (`site is not registered for your GitHub identity`) reworked for self-contained recovery: surfaces a "Did you mean?" hint (case-insensitive substring, Damerau-Levenshtein ≤ 2 fallback) when the typo is close to a registered slug, and names the admin remediation commands (`universe sites register …` / `universe sites update …`, staff-gated) directly in the body. Authorized-list rendering is scale-aware: inline when the caller's authorized count is ≤ 10, otherwise the count plus a `universe sites ls --mine` redirect (matches the `whoami` split above). Did-you-mean stays inline regardless of size — it's the primary typo-recovery surface. No external runbook redirect.

### Fixed

- **Duplicate error output on every non-`--json` failure.** Each command's catch path called both `log.error(message)` (clack pretty) and `exitWithCode(code, message)`, and the latter unconditionally re-wrote `message` to stderr — surfacing every error twice (decorated
  - raw). `exitWithCode` now drops the message arg and only exits; callers retain ownership of user-facing output.

### Notes

- Authz: staff-only commands rely on the artemis `requireRegistryAuthz` middleware (configurable via the `REGISTRY_AUTHZ_TEAM` env on the proxy; `staff` by default). The CLI does not pre-check team membership — it forwards the GitHub bearer and surfaces 403 responses.
- Identity: same chain as v0.4 — `$GITHUB_TOKEN` / `$GH_TOKEN` env → `gh auth token` → device-flow stored token. Run `universe login` first if no slot resolves.

## [0.4.0] - 2026-04-27

Proxy-plane pivot. Staff and CI hold only a `platform.yaml` + a GitHub identity; the R2 admin token lives exclusively inside the `artemis` proxy at `uploads.freecode.camp`. Locked by Universe ADR-016 + sprint 2026-04-26 DECISIONS Q9–Q15 + 2026-04-27 CLI namespace amendment.

This is a BREAKING release. v0.3.x consumers must migrate `platform.yaml` to the v2 schema and update the CLI surface (see **Changed**). The CLI no longer holds R2 credentials and never will.

### Added

- `universe login` / `logout` / `whoami` top-level commands. `login` drives a GitHub OAuth device flow against the baked-in `DEFAULT_GH_CLIENT_ID` (override via `UNIVERSE_GH_CLIENT_ID`) and persists the bearer at `~/.config/universe-cli/token` (mode 0600).
- `universe static ls [--site <site>]` lists recent deploys for the current (or specified) site.
- `src/lib/proxy-client.ts` — typed fetch wrapper for the artemis routes (`/api/whoami`, `/api/deploy/{init,upload,finalize}`, `/api/site/{site}/{deploys,promote,rollback}`). 401/403 → `EXIT_CREDENTIALS`; 422/5xx → `EXIT_STORAGE`; other 4xx → `EXIT_USAGE`. Exports `wrapProxyError(cmd, err)` so commands map thrown errors to one envelope/exit pair.
- `src/lib/identity.ts` — three-slot priority chain (post-F7): `$GITHUB_TOKEN` / `$GH_TOKEN` env → `gh auth token` shell-out → device-flow stored token. `whoami` surfaces the resolved slot.
- `src/lib/device-flow.ts` — RFC-8628 GitHub device flow with `slow_down` + `expired_token` + `access_denied` handling.
- `src/lib/token-store.ts` — `~/.config/universe-cli/token` reader / writer / deleter; respects `$XDG_CONFIG_HOME`; file mode 0600 + dir mode 0700.
- `src/lib/build.ts` — runs `platform.yaml` `build.command` in cwd via `shell: true` and verifies `build.output` directory landed.
- `src/lib/upload.ts` — per-file PUT to artemis with a configurable concurrency cap (default 6) and per-file error isolation. Surfaces partial uploads via `result.errors[]` so the caller can refuse to finalize. Hand-rolled async semaphore + inline static-site MIME map (no `p-limit` / `mrmime` runtime deps).
- `src/lib/ignore.ts` — minimal gitignore-style matcher for the upload set (`*`, `**`, `?`, anchored vs basename matches).
- `src/lib/constants.ts` — `DEFAULT_GH_CLIENT_ID` (public OAuth App client id, safe to ship in source) and `DEFAULT_PROXY_URL` (`https://uploads.freecode.camp`).
- `platform.yaml` v2 schema (`src/lib/platform-yaml.{ts,schema.ts}`) with zod validator and strict unknown-key rejection. v1 migration detector: any of `r2`, `stack`, `domain`, `static`, `name` at the root produces a clear error pointing at `docs/platform-yaml.md`.
- Husky pre-commit gate runs `pnpm lint` + `pnpm typecheck` + `pnpm test`.
- Release workflow now derives the npm dist-tag from the version string (`alpha` / `beta` / `next` / `latest`) and flags GitHub prerelease badges automatically.

### Changed

- **BREAKING (CLI surface):**
  - `universe static deploy --force` → removed; missing git state auto-falls-back to a synthetic sha.
  - `universe static deploy --output-dir` → `--dir`.
  - `universe static promote <deployId>` (positional) → `--from <deployId>` (flag).
  - `universe static rollback --confirm` → `--to <deployId>` (required).
  - cli.ts now detects `static` as the first non-flag positional, so `universe --json static deploy` works alongside `universe static deploy --json`.
- **BREAKING (network):** CLI no longer reads R2 credentials. All uploads are streamed through the artemis proxy. Direct-to-R2 paths (`@aws-sdk/client-s3`, `rclone` config probing, `~/.aws/credentials`) are gone. Set `UNIVERSE_PROXY_URL` to override the default proxy host.
- **BREAKING (`platform.yaml`):** v1 → v2. Removed `name` (renamed to `site`), `stack`, `domain`, `static.*`, `r2.*`. New shape: `site` (required) + `build` (defaulted) + `deploy` (defaulted).
- `docs/platform-yaml.md` — `universe deploy` → `universe static deploy` references updated.

### Removed

- `src/credentials/` — R2 credential resolver.
- `src/storage/` — direct S3 client + alias / deploys / operations helpers.
- `src/deploy/{upload,id,preflight,metadata}.ts` — pre-pivot deploy pipeline. The proxy now owns deploy id minting, alias atomicity, and metadata.
- `src/config/{loader,schema}.ts` — replaced by `src/lib/platform-yaml.*` (v2).
- `errors.OutputDirError`, `errors.AliasError`, `errors.DeployNotFoundError` — no callers post-pivot.
- Identity slots `gha_oidc` and `woodpecker_oidc` — artemis validates bearers via GitHub `GET /user`, which only accepts user-scoped PATs / OAuth tokens. Re-add when artemis grows an OIDC verifier.
- Runtime deps: `@aws-sdk/client-s3`, `@smithy/util-stream`, `aws-sdk-client-mock`, `aws-sdk-client-mock-vitest`, `mrmime`, `p-limit`.

## [0.3.3] - 2026-04-18

Release 0.3.3

## [0.3.2] - 2026-04-18

Release 0.3.2

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
