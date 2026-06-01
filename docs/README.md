# universe-cli

A CLI for freeCodeCamp staff to deploy and manage static constellation apps on the Universe platform. It carries your GitHub identity to the **artemis** proxy (`uploads.freecode.camp`), which holds every infrastructure secret — the R2 admin key, the site→team registry, and the GitHub App that creates repos. Nothing privileged reaches your machine.

- **[STAFF-GUIDE.md](STAFF-GUIDE.md)** — ship a site end-to-end: log in → request a repo → register → deploy → promote, plus registry, repo creation, CI, troubleshooting.
- **[reference.md](reference.md)** — every command, flag, exit code, identity source, and environment variable.
- **[platform-yaml.md](platform-yaml.md)** — the `platform.yaml` schema.
- **[RELEASING.md](RELEASING.md)** — cutting a new CLI version.

The rest of this file is the architecture and internals (operators and contributors).

## Install

```sh
npm i -g @freecodecamp/universe-cli
```

Or download a signed standalone binary (no Node.js required) for your platform from [Releases](https://github.com/freeCodeCamp-Universe/universe-cli/releases). Node 24+ if installing from npm.

## What it fits into

Universe runs two classes of app. **Constellations** are dynamic apps — built to containers, run on Kubernetes by the Apollo controller. **Static apps** are pre-built artifacts served from R2. `universe` is the client for the **static-app** plane only; constellation deploys go through Apollo, not this CLI. What you may do is decided server-side from your GitHub team membership, never from anything in your repo.

## Architecture

The CLI is an **identity-only client**. It carries the user's GitHub bearer to artemis and nothing more. artemis owns the privileged side:

| Asset                                | Owner                    | Reaches the CLI?      |
| ------------------------------------ | ------------------------ | --------------------- |
| R2 admin credentials                 | artemis (cluster secret) | No                    |
| Site → team registry (Valkey-backed) | artemis                  | No                    |
| Apollo-11 GitHub App private key     | artemis (cluster secret) | No                    |
| GitHub bearer (user identity)        | CLI                      | Yes — sent to artemis |

Every privileged action (R2 writes, registry mutations, repo creation) runs server-side after artemis validates the bearer against GitHub `GET /user` and checks team membership. The CLI only formats requests, ships uploads, and renders responses.

```
┌──────────────────┐   GitHub identity   ┌────────────┐   R2 admin key   ┌─────┐
│  universe (CLI)  │ ──────────────────► │  artemis   │ ───────────────► │ R2  │
│  staff laptop /  │  (4-source chain)   │  proxy     │   (cluster only) │     │
│  CI / Woodpecker │ ◄────────────────── │ uploads.   │ ◄─────────────── │     │
└──────────────────┘   deploy session    │ freecode.  │                  └─────┘
                       (short-lived JWT) │ camp       │
                                         └────────────┘
                                                ▲
                                                │ site → team map
                                                ▼  (Valkey-backed registry)
                                         ┌────────────┐
                                         │ GitHub org │
                                         │ team check │
                                         └────────────┘
```

The CLI resolves a GitHub identity through a [4-source chain](reference.md#identity), then exchanges it with artemis for a short-lived deploy-session JWT. artemis maps the target site to its owning team via the registry and probes GitHub team membership before authorizing the R2 write.

### Repository-creation plane

`universe repo` adds a second server-side capability, gated by an approval queue:

1. Staff request a repo in `freeCodeCamp-Universe`.
1. The request enters an artemis-owned, Valkey-backed approval queue.
1. An admin (the approver team) approves or rejects it.
1. On approval, artemis mints an **Apollo-11 GitHub App** installation token server-side and creates the repo synchronously: status `active` on success, `failed` on error (the approve outcome is `ok` / `approved_failed`).

The Apollo-11 App key is a cluster secret — same class as the R2 keys — and never reaches the CLI. artemis routes (`/api/repo*`, feature-gated; unmounted when the App key is absent): `POST /api/repo`, `GET /api/repos`, `GET /api/repo/{id}`, `POST /api/repo/{id}/approve`, `POST /api/repo/{id}/reject`, `GET /api/repo/templates`.

### Upstream specs

The CLI ↔ artemis contract is authoritative upstream and never extended in this repo — contract changes go through an ADR amendment.

- [ADR-016 — Deploy proxy](https://github.com/freeCodeCamp-Universe/Architecture/blob/main/decisions/016-deploy-proxy.md) — identity chain, per-site authorization, deploy-session JWT scope, R2 layout.
- [Universe ARCHI-DIAGRAM](https://github.com/freeCodeCamp-Universe/Architecture/blob/main/ARCHI-DIAGRAM.md) — galaxy topology and request/storage/auth flows.

### Operating artemis (not mirrored here)

Running the service — config, route surface, health/observability, failure modes — is owned by the artemis and infra repos. This repo documents the **CLI**, not the service, and does not mirror artemis config or routes (one source of truth, no cross-repo drift). Operators go to ADR-016, the artemis repo `README.md`, and the infra runbooks [`02-deploy-artemis-service.md`](https://github.com/freeCodeCamp/infra/blob/main/docs/runbooks/02-deploy-artemis-service.md) / [`03-artemis-postdeploy-check.md`](https://github.com/freeCodeCamp/infra/blob/main/docs/runbooks/03-artemis-postdeploy-check.md).

## Repo layout

```
src/
  cli.ts              # cac entry + command wiring
  errors.ts           # typed error envelope
  index.ts            # bin entry → cli.ts
  commands/           # per-verb handlers (deploy, promote, rollback, ls, login, …)
  commands/repo/      # repo-request queue: create/ls/approve/reject/status, _shared, schema (zod)
  deploy/             # upload pipeline (walk, ignore, progress)
  lib/                # platform-yaml, identity, proxy-client, constants
  output/             # exit-codes, JSON envelopes, terminal formatters
tests/                # unit (mirrors src/) + e2e/ (in-process fake-artemis + spawned-binary smoke)
dist/                 # tsup output (ESM index.js + CJS index.cjs for SEA)
```

## Build & test

Node 24+ required.

| Command           | Purpose                                                     |
| ----------------- | ----------------------------------------------------------- |
| `pnpm install`    | Install dependencies.                                       |
| `pnpm lint`       | oxlint.                                                     |
| `pnpm typecheck`  | `tsc --noEmit`.                                             |
| `pnpm test`       | vitest run (includes the in-process E2E layer).             |
| `pnpm build`      | tsup → `dist/`.                                             |
| `pnpm test:smoke` | Opt-in: real-artemis smoke against `uploads.freecode.camp`. |

A husky `pre-commit` hook runs lint + typecheck + test on every commit.

## Internal conventions

Contracts, not style preferences.

- **Tests live under `tests/**`**, mirroring `src/{commands,deploy,lib,output}`. Never co-located.
- **Exit codes are a stable contract** (`src/output/exit-codes.ts`); callers import the constants, never integers. Full list in [reference.md](reference.md#exit-codes).
- **Site-name validation:** `SITE_NAME_PATTERN` in `src/lib/platform-yaml.schema.ts`. **Repo-name validation:** `REPO_NAME_RE` in `src/commands/repo/schema.ts` — byte-identical to artemis `reporequest.NameRE`; keep them in lockstep, a mismatch lets bad names bypass preflight.
- **`platform.yaml` schema** (`src/lib/platform-yaml.schema.ts`), shape `{site, build?, deploy}`. Strict — unknown keys reject.
- **Identity is a 4-source chain** (`src/lib/identity.ts`); see [reference.md](reference.md#identity). No secrets, no `.env` reads — credentials come from the chain or `UNIVERSE_PROXY_URL`, never from disk.
- **Repo authz is org-scoped to `freeCodeCamp-Universe`:** create/ls/status → `staff`; approve/reject → the approver team. artemis probes membership against `GH_REPO_ORG` (distinct from the site-registry `GH_ORG`).
- **Packaging:** the npm tarball ships `dist/` + `README.md` + `LICENSE`. SEA artifacts (`sea-config.json` + `entitlements.plist` + ad-hoc macOS `codesign`) build the four signed binaries attached to Releases. Release is OIDC-only (Trusted Publisher, no `NPM_TOKEN`) — see [RELEASING.md](RELEASING.md).
- **E2E layer** (`tests/e2e/`, inside `pnpm test`): in-process tests call handlers directly against a stateful `fake-artemis.ts`; a spawned-binary smoke boots `dist/index.js` to catch loader/tsup/cac regressions; per-test `mkdtemp` `XDG_CONFIG_HOME` keeps runs parallel-safe. `pnpm test:smoke` hits the live proxy (gated on `UNIVERSE_E2E_REAL=1`; needs a pre-registered `UNIVERSE_REAL_SITE`).

## Where to file work

- **Bugs and features** — [GitHub issues](https://github.com/freeCodeCamp-Universe/universe-cli/issues).
- **CLI ↔ artemis contract changes** — an ADR amendment upstream ([ADR-016](https://github.com/freeCodeCamp-Universe/Architecture/blob/main/decisions/016-deploy-proxy.md)). Do not extend the contract here.
