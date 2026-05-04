# universe-cli

Staff-facing TypeScript CLI for deploying, promoting, and rolling back
static sites on the freeCodeCamp Universe platform. CLI talks to the
**artemis** deploy proxy (`uploads.freecode.camp`); R2 admin credentials
never leave the cluster.

## Project

The planning documents (PRD, summary and phased TODO) are in `design/prd.md`, `design/summary.md` and `design/todo.md` respectively.

## Commands

```sh
pnpm install         # install dependencies
pnpm test            # run Vitest
pnpm lint            # run Oxlint
pnpm lint:fix        # run Oxlint with auto-fix
pnpm fmt             # run oxfmt (format)
pnpm fmt:check       # check formatting without writing
```

Vitest globals are enabled — no need to import `describe`, `it`, `expect`.

The pre-commit hook runs `lint-staged`, which auto-fixes and formats staged JS/TS files via Oxlint and oxfmt.

## TypeScript configuration

Strict mode is on with additional checks see `tsconfig.json`.

## Linting

See `.oxlintrc.json`. Use disables sparingly. Do not modify the config.

## Skills to use

- Use the `workflow` skill when asked to "continue".
- Use `typescript-guidelines` when writing TypeScript or .tsx files.
- Use `typescript-test-guidelines` when writing tests or test.tsx files.

## Forbidden Behaviour

Do NOT look inside node_modules. To verify a package is installed, run `pnpm list <package-name>`.
Do NOT install packages. If you need something, ask me to install it for you.
Do not use the tdd-unit skill.
Do NOT look inside the dist folder.

## Missing Dependency Gate (Required)

If tests/lint/check fail due to missing dependencies:

1. **Stop and ask** for the exact install needed.
2. Include: (a) what is missing, (b) why it is required, and (c) the exact package/tool name(s).
3. **Do not pivot** to a different implementation approach to avoid the missing dependency unless the user explicitly declines installation.

## Dependencies

Always pin exact versions. For example, if you want me to install `nanostores` ask me to do
`pnpm add --save-exact nanostores @nanostores/react`

## Doc Index

- **Ownership model** — [`~/DEV/fCC-U/Universe/CLAUDE.md`](../Universe/CLAUDE.md)
  is the source of truth for which team owns which doc across the platform.
- **Field notes** — operational findings for this repo live upstream at
  [`Universe/spike/field-notes/universe-cli.md`](../Universe/spike/field-notes/universe-cli.md).
  Write findings there, not here.
- **Authoritative spec** — [`~/DEV/fCC-U/Universe/decisions/016-deploy-proxy.md`](../Universe/decisions/016-deploy-proxy.md)
  (D016). Defines CLI ↔ artemis contract, identity priority chain, and
  per-site authorization model. **Supersedes** the gxy-cassiopeia RFC §4.8
  (Woodpecker-pipeline pivot, archaeology — branch `feat/woodpecker-pivot`
  was never merged).
- **Sprint cursor** — current sprint at
  [`~/DEV/fCC/infra/docs/sprints/2026-04-26/`](../../fCC/infra/docs/sprints/2026-04-26/);
  CLI dispatch is `dispatches/T32-cli-v04-rewrite.md`.
- **Project runbooks** — [`docs/FLIGHT-MANUAL.md`](docs/FLIGHT-MANUAL.md),
  [`docs/STAFF-GUIDE.md`](docs/STAFF-GUIDE.md), [`docs/RELEASING.md`](docs/RELEASING.md).

  ## Non-obvious conventions

- **Exit codes are stable contracts.** `src/output/exit-codes.ts` is the
  single export point; callers must import constants, never hard-code
  integers. `EXIT_OUTPUT_DIR (14)`, `EXIT_ALIAS (16)`,
  `EXIT_DEPLOY_NOT_FOUND (17)` are reserved (no current callers) — kept
  for stability across v0.3 → v0.4 transitions.
- **Site name validation is D19-constrained** — lowercase letters, digits,
  single hyphens; 1–63 chars; no leading/trailing/consecutive hyphens.
  See `src/lib/platform-yaml.schema.ts` `SITE_NAME_PATTERN`.
- **`platform.yaml` is v2 only.** Schema in `src/lib/platform-yaml.schema.ts`
  (`{site, build?, deploy}`). v1 fragments (`name`, `r2`, `bucket`,
  `rclone_remote`, `region`, `stack`, `domain`, `static`) trigger an
  explicit migration error. See `docs/platform-yaml.md`.
- **Config precedence:** CLI flags > env > `platform.yaml` defaults.
  Recognized env: `UNIVERSE_PROXY_URL` (default
  `https://uploads.freecode.camp`), `UNIVERSE_GH_CLIENT_ID` (overrides
  `DEFAULT_GH_CLIENT_ID`). No `UNIVERSE_STATIC_*` vars in v0.4.
- **Identity resolution is a 5-slot priority chain** (D016 Q10), implemented
  in `src/lib/identity.ts`: `$GITHUB_TOKEN` / `$GH_TOKEN` → GHA OIDC →
  Woodpecker OIDC (placeholder) → `gh auth token` → device-flow stored
  token at `~/.config/universe-cli/token` (mode 0600). GHA OIDC slot
  presently produces an ID token that artemis cannot validate — CI users
  must supply `$GITHUB_TOKEN` until artemis grows an OIDC verifier.
- **No secrets, no `.env` reads** anywhere in the CLI. Credentials come
  from the identity chain (env / OIDC / `gh` / device-flow) or the
  `UNIVERSE_PROXY_URL` env var — never disk.
- **Binaries published two ways.** npm tarball ships `dist/` (ESM
  `index.js` for `node`/Bun consumers + CJS `index.cjs` for SEA), `README.md`,
  `LICENSE` — see `package.json` `files`. SEA artifacts (`sea-config.json`
  - `entitlements.plist` + ad-hoc `codesign`) build the four-platform
    signed binaries attached to GitHub Releases.
- **Release flow is OIDC-only.** `Actions → Release` workflow_dispatch
  publishes to npm via Trusted Publisher (`freeCodeCamp-Universe/universe-cli/release.yml`).
  No `NPM_TOKEN`. Prerelease versions (`*-alpha.*`, `*-beta.*`, `*-rc.*`)
  must publish under a non-`latest` dist-tag — `release.yml` is being
  patched to derive `--tag` from the version string.
