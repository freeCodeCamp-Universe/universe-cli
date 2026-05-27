# universe-cli — Project Overview

Read this when you change CLI code. Other entry points:

- Root [`README.md`](../README.md) — install + CLI surface + env overrides.
- [`STAFF-GUIDE.md`](STAFF-GUIDE.md) — staff guide: deploy / promote / rollback, site registry, repo creation.
- [`platform-yaml.md`](platform-yaml.md) — `platform.yaml` schema reference.
- [`RELEASING.md`](RELEASING.md) — cutting a release.

## What it is

TypeScript CLI for the freeCodeCamp Universe platform. Identity-only client — carries a GitHub bearer to **artemis** (`uploads.freecode.camp`), which owns the R2 admin credentials and the site registry. The CLI holds no infrastructure secrets.

## Architecture

```
┌──────────────────┐   GitHub identity   ┌────────────┐   R2 admin key   ┌─────┐
│  universe (CLI)  │ ──────────────────► │  artemis   │ ───────────────► │ R2  │
│  staff laptop /  │   (3-slot chain)    │  proxy     │   (cluster only) │     │
│  CI / Woodpecker │ ◄────────────────── │ uploads.   │ ◄─────────────── │     │
└──────────────────┘   deploy session    │ freecode.  │                  └─────┘
                       (short-lived JWT) │ camp       │
                                         └────────────┘
                                                ▲
                                                │ site → team map
                                                │ (Valkey-backed registry)
                                                ▼
                                         ┌────────────┐
                                         │ GitHub org │
                                         │ team check │
                                         └────────────┘
```

### Repository-creation plane

`universe repo` adds a second server-side capability alongside deploys. Staff request a repo in `freeCodeCamp-Universe`; the request enters an artemis-owned, Valkey-backed **approval queue** (independent of the legacy Windmill flow); an admin on a dedicated GitHub team approves; artemis then mints an **Apollo-11 GitHub App** installation token **server-side** and creates the repo synchronously (status `active`) or records the failure (`approved_failed`). The App private key is a cluster secret — the same class as the R2 keys — and never reaches the CLI or a staff laptop; the CLI carries only the user's GitHub bearer.

Routes (feature-gated server-side; unmounted when the App key is absent): `POST /api/repo`, `GET /api/repos`, `GET /api/repo/{id}`, `POST /api/repo/{id}/approve`, `POST /api/repo/{id}/reject`, `GET /api/repo/templates`. Wire shape + authz: ADR-016 amendment.

## Upstream specs (read-only here)

- [ADR-016 — Deploy proxy](https://github.com/freeCodeCamp-Universe/Universe/blob/main/decisions/016-deploy-proxy.md) — CLI ↔ artemis contract, identity chain, per-site authorization, deploy-session JWT scope, R2 layout.
- [Universe ARCHI-DIAGRAM](https://github.com/freeCodeCamp-Universe/Universe/blob/main/ARCHI-DIAGRAM.md) — galaxy topology + request / storage / auth flows.

## Cross-repo runbooks (infra team owns)

- [`02-deploy-artemis-service.md`](https://github.com/freeCodeCamp/infra/blob/main/docs/runbooks/02-deploy-artemis-service.md) — bring up / upgrade artemis on `gxy-cassiopeia`.
- [`03-artemis-postdeploy-check.md`](https://github.com/freeCodeCamp/infra/blob/main/docs/runbooks/03-artemis-postdeploy-check.md) — E2E verification after any artemis chart change.

## Repo layout

```
src/
  cli.ts              # cac entry + command wiring
  errors.ts           # typed error envelope
  index.ts            # bin entry → cli.ts
  commands/           # per-verb handlers (deploy, promote, rollback, ls, login, …)
  commands/repo/      # repo-request queue: create/ls/approve/reject/status, _shared, schema (zod)
  deploy/             # upload pipeline (tar, ignore, progress)
  lib/                # platform-yaml, identity, proxy-client, constants
  output/             # exit-codes, JSON envelopes, terminal formatters
tests/
  e2e/                # in-process fake-artemis + spawned-binary smoke
  commands/ deploy/ lib/ output/   # unit, mirrors src/
dist/                 # tsdown output (CJS index.cjs for SEA)
```

## Build & test

```sh
pnpm install
pnpm lint            # oxlint
pnpm test            # vitest run
pnpm typecheck       # tsc --noEmit
pnpm build           # tsdown → dist/
pnpm test:smoke      # opt-in: real-artemis smoke against uploads.freecode.camp
```

`pre-commit` (husky) runs lint + typecheck + test on every commit. Node 24+ required.

## Internal conventions

- **Tests live under `tests/**`**, mirroring `src/{commands,deploy,lib,output}`. Never co-located.
- **Exit codes are a stable contract.** Defined in `src/output/exit-codes.ts`; callers import constants, never integers.
- **Site-name validation:** lowercase letters, digits, single hyphens; 1–63 chars; no leading/trailing/consecutive hyphens. Source: `SITE_NAME_PATTERN` in `src/lib/platform-yaml.schema.ts`.
- **`platform.yaml` schema** lives in `src/lib/platform-yaml.schema.ts` (`{site, build?, deploy}`). Strict — unknown keys reject.
- **Config precedence:** CLI flags > env > `platform.yaml` defaults. Recognized env: `UNIVERSE_PROXY_URL`, `UNIVERSE_GH_CLIENT_ID`.
- **Identity is a 3-slot priority chain** in `src/lib/identity.ts`: `$GITHUB_TOKEN` / `$GH_TOKEN` → device-flow token at `~/.config/universe-cli/token` (mode 0600; `universe login`) → `gh auth token` shell-out (laptop fallback). artemis validates bearers via GitHub `GET /user`.
- **No secrets, no `.env` reads.** Credentials come from the identity chain or `UNIVERSE_PROXY_URL`, never disk.
- **Repo-name validation:** `^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$` (mixed-case ok, ≤100 chars). Source: `REPO_NAME_RE` in `src/commands/repo/schema.ts`; byte-identical to artemis `reporequest.NameRE` so client preflight and server validation never disagree.
- **Repo authz is org-scoped to `freeCodeCamp-Universe`.** `repo create`/`ls`/`status` are gated to the staff team; `approve`/`reject` to a dedicated admin team. artemis probes membership against `GH_REPO_ORG` (distinct from the site-registry `GH_ORG`). The Apollo-11 App key + the approval queue live server-side only — the CLI never holds them.
- **npm tarball ships `dist/` + `README.md` + `LICENSE`** (see `package.json` `files`). SEA artifacts (`sea-config.json` + `entitlements.plist` + ad-hoc `codesign` on macOS) build the four-platform signed binaries attached to GitHub Releases.
- **Release is OIDC-only.** `Actions → Release` publishes to npm via Trusted Publisher. No `NPM_TOKEN`. Prereleases (`*-alpha.*`, `*-beta.*`, `*-rc.*`) publish under a non-`latest` dist-tag.
- **E2E layer at `tests/e2e/`** runs inside `pnpm test`. Two slices share `tests/e2e/_helpers/`: in-process tests call command handlers (`deploy({...}, deps)`) with the real `proxy-client` against a stateful `fake-artemis.ts` (`http.createServer` mirroring proxy routes); a spawned-binary smoke (`binary-smoke.test.ts`) boots `dist/index.cjs` once via `beforeAll` to catch ESM-loader / tsdown / cac regressions. Per-test `mkdtemp` `XDG_CONFIG_HOME` keeps runs parallel-safe. Add a verb: copy `tests/e2e/whoami.test.ts` and extend `fake-artemis.ts` with the route it hits.
- **`pnpm test:smoke`** runs `tests/e2e/smoke-real-artemis.test.ts` against the live proxy. Gated on `UNIVERSE_E2E_REAL=1` (set by the script). Required: `UNIVERSE_REAL_SITE` (pre-registered slug — smoke does NOT register/delete). Optional: `UNIVERSE_REAL_TOKEN` (else falls through to `gh auth token`). Default proxy `https://uploads.freecode.camp`; override via `UNIVERSE_REAL_PROXY_URL`. Covers `whoami`, `static ls`, `static deploy` (preview), `static deploy --promote` — the last fetches the public URL with cache busting and asserts a freshly-deployed marker. Run: `UNIVERSE_REAL_SITE=test pnpm test:smoke`.

## Where to file work

- **Bugs / features** — [GitHub issues](https://github.com/freeCodeCamp-Universe/universe-cli/issues).
- **CLI ↔ artemis contract changes** — open an ADR amendment upstream (ADR-016). Do not extend in this repo.
