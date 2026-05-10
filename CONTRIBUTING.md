# Contributing

Thanks for your interest in improving the Universe CLI.

## Development Setup

Prerequisites: Node 22+ (Node 24 pinned for CI — see `.nvmrc`) and pnpm 10+.

```sh
pnpm install
pnpm lint          # oxlint
pnpm test          # vitest run
pnpm tsc --noEmit  # typecheck
pnpm build         # tsup → dist/
```

A husky pre-commit hook runs `pnpm lint` and `pnpm test` on every commit.

See the [Flight Manual](docs/FLIGHT-MANUAL.md) for the full build, test, and
credential setup runbook.

## Proposing Changes

1. Open an issue first for anything beyond a small fix so we can align on scope.
2. Fork the repository and create a topic branch.
3. Keep changes focused. Include tests for new behavior and update the docs
   that describe the affected surface (README, Staff Guide, or Flight Manual).
4. Run `pnpm lint`, `pnpm test`, and `pnpm tsc --noEmit` before opening a pull
   request.
5. Open a pull request against `main` and describe the change, the motivation,
   and any user-visible impact.

Commit messages should be imperative and scoped (for example,
`deploy: skip hidden files during upload`).

## Releases

Releases are cut manually by maintainers via the GitHub `Release` workflow.
See [RELEASING.md](docs/RELEASING.md) for the procedure.

## Security

Do not file public issues for security vulnerabilities. See
[SECURITY.md](SECURITY.md) for the reporting channel.

## Code of Conduct

This project follows the
[freeCodeCamp Code of Conduct](https://www.freecodecamp.org/news/code-of-conduct/).
By participating you agree to uphold it.

## Internal conventions

- **Test layout is `tests/**`, not co-located.** Mirrors `src/`. Pre-pivot RFC
  text prescribing `src/*.test.ts` was a doc bug, now archaeology.
- **Exit codes are stable contracts.** `src/output/exit-codes.ts` is the
  single export point; callers must import constants, never hard-code
  integers. `EXIT_OUTPUT_DIR (14)`, `EXIT_ALIAS (16)`,
  `EXIT_DEPLOY_NOT_FOUND (17)` are reserved (no current callers) and kept for
  stability across v0.3 -> v0.4 transitions.
- **Site name validation is D19-constrained:** lowercase letters, digits, and
  single hyphens; 1-63 chars; no leading, trailing, or consecutive hyphens.
  See `src/lib/platform-yaml.schema.ts` `SITE_NAME_PATTERN`.
- **`platform.yaml` is v2 only.** Schema in `src/lib/platform-yaml.schema.ts`
  (`{site, build?, deploy}`). v1 fragments (`name`, `r2`, `bucket`,
  `rclone_remote`, `region`, `stack`, `domain`, `static`) trigger an explicit
  migration error. See `docs/platform-yaml.md`.
- **Config precedence:** CLI flags > env > `platform.yaml` defaults. Recognized
  env: `UNIVERSE_PROXY_URL` (default `https://uploads.freecode.camp`),
  `UNIVERSE_GH_CLIENT_ID` (overrides `DEFAULT_GH_CLIENT_ID`). No
  `UNIVERSE_STATIC_*` vars in v0.4.
- **Identity resolution is a 5-slot priority chain** (ADR-016 Q10),
  implemented in `src/lib/identity.ts`: `$GITHUB_TOKEN` / `$GH_TOKEN` -> GHA
  OIDC -> Woodpecker OIDC (placeholder) -> `gh auth token` -> device-flow
  stored token at `~/.config/universe-cli/token` (mode 0600). GHA OIDC slot
  presently produces an ID token that artemis cannot validate, so CI users must
  supply `$GITHUB_TOKEN` until artemis grows an OIDC verifier.
- **No secrets, no `.env` reads** anywhere in the CLI. Credentials come from
  the identity chain (env / OIDC / `gh` / device-flow) or the
  `UNIVERSE_PROXY_URL` env var, never disk.
- **Binaries published two ways.** npm tarball ships `dist/` (ESM `index.js`
  for `node`/Bun consumers + CJS `index.cjs` for SEA), `README.md`, and
  `LICENSE` (see `package.json` `files`). SEA artifacts (`sea-config.json` +
  `entitlements.plist` + ad-hoc `codesign`) build the four-platform signed
  binaries attached to GitHub Releases.
- **Release flow is OIDC-only.** `Actions -> Release` workflow_dispatch
  publishes to npm via Trusted Publisher
  (`freeCodeCamp-Universe/universe-cli/release.yml`). No `NPM_TOKEN`.
  Prerelease versions (`*-alpha.*`, `*-beta.*`, `*-rc.*`) publish under a
  non-`latest` dist-tag; `release.yml` derives `--tag` from the version string.
