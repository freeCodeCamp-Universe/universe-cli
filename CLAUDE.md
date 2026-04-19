# universe-cli

Staff-facing TypeScript CLI for deploying, promoting, and rolling back static sites
on the freeCodeCamp Universe platform (`gxy-cassiopeia`).

## Doc Index

- **Ownership model** — [`~/DEV/fCC-U/Universe/CLAUDE.md`](../Universe/CLAUDE.md)
  is the source of truth for which team owns which doc across the platform.
- **Field notes** — operational findings for this repo live upstream at
  [`Universe/spike/field-notes/universe-cli.md`](../Universe/spike/field-notes/universe-cli.md).
  Write findings there, not here.
- **Authoritative spec** — the in-flight rewrite (T16–T20, Woodpecker API
  integration) is specified in `~/DEV/fCC/infra/docs/rfc/gxy-cassiopeia.md` §4.8.
  That RFC supersedes any deploy/promote/rollback description in `docs/` until
  v0.4.0-beta.1 ships.
- **Project runbooks** — [`docs/FLIGHT-MANUAL.md`](docs/FLIGHT-MANUAL.md),
  [`docs/STAFF-GUIDE.md`](docs/STAFF-GUIDE.md), [`docs/RELEASING.md`](docs/RELEASING.md).

## Non-obvious conventions

- **Test layout is `tests/**`, not co-located.** The gxy-cassiopeia RFC task doc
prescribes `src/\*.test.ts`— that is a doc bug in the RFC, not a directive for
this repo. Keep tests under`tests/`mirroring`src/`.
- **Exit codes are stable contracts.** `src/output/exit-codes.ts` is the single
  export point; callers must import constants, never hard-code integers. The RFC
  references them by name (e.g., `EXIT_CREDENTIALS`).
- **Site name validation is D19-constrained** — lowercase, digits, hyphens only,
  no consecutive `-`, no leading/trailing `-`. See `src/config/schema.ts`.
- **Config precedence:** CLI flags > env (`UNIVERSE_STATIC_*`) > `platform.yaml`
  defaults. Resolved in `src/config/loader.ts`.
- **No secrets, no `.env` reads** anywhere in the CLI. Credentials come from
  ambient env (AWS SDK default chain) or explicit flags — never disk.
- **Binaries are published as a single-file ESM bundle** (`dist/index.js` via
  tsup) plus SEA (`sea-config.json`, `entitlements.plist`) for the signed macOS
  artifact. Only `dist/index.js` and its map ship in the npm tarball.
- **Pre-commit runs `pnpm lint` + `pnpm test` via husky.** Hooks are not
  bypassed — if something blocks, fix the underlying issue.
