# Universe CLI — Operator Docs

Pick a workflow.

| I want to…                                                           | Start here                             |
| -------------------------------------------------------------------- | -------------------------------------- |
| **Use the CLI** to deploy / promote / rollback a static site         | [STAFF-GUIDE.md](STAFF-GUIDE.md)       |
| **Understand the architecture** — where the CLI sits in the platform | [§Architecture](#architecture) (below) |
| **Build & test the CLI** locally                                     | [RELEASING.md](RELEASING.md)           |
| **Cut a release** of the CLI                                         | [RELEASING.md](RELEASING.md)           |
| **Write `platform.yaml`** for a site                                 | [platform-yaml.md](platform-yaml.md)   |

## Architecture

The CLI is the staff-facing client for the **artemis** deploy proxy. It
holds no infrastructure credentials — R2 admin keys live inside the
cluster, behind artemis at `uploads.freecode.camp`.

```
┌──────────────────┐   GitHub identity   ┌────────────┐   R2 admin key   ┌─────┐
│  universe (CLI)  │ ──────────────────► │  artemis   │ ───────────────► │ R2  │
│  staff laptop /  │   (5-slot chain)    │  proxy     │   (cluster only) │     │
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

**Authoritative design docs** (in the Universe repo — read-only here):

- [ADR-016 — Deploy proxy](https://github.com/freeCodeCamp-Universe/Universe/blob/main/decisions/016-deploy-proxy.md)
  — CLI ↔ artemis contract, identity priority chain, per-site
  authorization, deploy-session JWT scope, R2 layout.
- [Universe ARCHI-DIAGRAM](https://github.com/freeCodeCamp-Universe/Universe/blob/main/ARCHI-DIAGRAM.md)
  — galaxy topology + request / storage / auth flows.

**Cross-repo runbooks** (artemis-side, owned by the infra team):

- [`fCC/infra/docs/runbooks/02-deploy-artemis-service.md`](https://github.com/freeCodeCamp/infra/blob/main/docs/runbooks/02-deploy-artemis-service.md)
  — bring up / upgrade artemis on `gxy-cassiopeia`.
- [`fCC/infra/docs/runbooks/03-artemis-postdeploy-check.md`](https://github.com/freeCodeCamp/infra/blob/main/docs/runbooks/03-artemis-postdeploy-check.md)
  — E2E verification after any artemis chart change.

## Field notes

Operational findings from building this CLI live upstream at
[`Universe/spike/field-notes/archive/2026-05-10/universe-cli.md`](https://github.com/freeCodeCamp-Universe/Universe/blob/main/spike/field-notes/archive/2026-05-10/universe-cli.md)
(frozen 2026-05-10). New findings should go to that team's current
field-notes surface — not into this repo.

-## Internal conventions
-
-- **Test layout is `tests/**`, not co-located.** Mirrors `src/`. Pre-pivot RFC
-text prescribing `src/\*.test.ts` was a doc bug, now archaeology.
-- **Exit codes are stable contracts.** `src/output/exit-codes.ts` is the
-  single export point; callers must import constants, never hard-code
-  integers. `EXIT_OUTPUT_DIR (14)`, `EXIT_ALIAS (16)`,
-  `EXIT_DEPLOY_NOT_FOUND (17)` are reserved (no current callers) and kept for
-  stability across v0.3 -> v0.4 transitions.
-- **Site name validation is D19-constrained:** lowercase letters, digits, and
-  single hyphens; 1-63 chars; no leading, trailing, or consecutive hyphens.
-  See `src/lib/platform-yaml.schema.ts` `SITE_NAME_PATTERN`.
-- **`platform.yaml` is v2 only.** Schema in `src/lib/platform-yaml.schema.ts`
-  (`{site, build?, deploy}`). v1 fragments (`name`, `r2`, `bucket`,
-  `rclone_remote`, `region`, `stack`, `domain`, `static`) trigger an explicit
-  migration error. See `docs/platform-yaml.md`.
-- **Config precedence:** CLI flags > env > `platform.yaml` defaults. Recognized
-  env: `UNIVERSE_PROXY_URL` (default `https://uploads.freecode.camp`),
-  `UNIVERSE_GH_CLIENT_ID` (overrides `DEFAULT_GH_CLIENT_ID`). No
-  `UNIVERSE_STATIC_*` vars in v0.4.
-- **Identity resolution is a 5-slot priority chain** (ADR-016 Q10),
-  implemented in `src/lib/identity.ts`: `$GITHUB_TOKEN` / `$GH_TOKEN` -> GHA
-  OIDC -> Woodpecker OIDC (placeholder) -> `gh auth token` -> device-flow
-  stored token at `~/.config/universe-cli/token` (mode 0600). GHA OIDC slot
-  presently produces an ID token that artemis cannot validate, so CI users must
-  supply `$GITHUB_TOKEN` until artemis grows an OIDC verifier.
-- **No secrets, no `.env` reads** anywhere in the CLI. Credentials come from
-  the identity chain (env / OIDC / `gh` / device-flow) or the
-  `UNIVERSE_PROXY_URL` env var, never disk.
-- **Binaries published two ways.** npm tarball ships `dist/` (ESM `index.js`
-  for `node`/Bun consumers + CJS `index.cjs` for SEA), `README.md`, and
-  `LICENSE` (see `package.json` `files`). SEA artifacts (`sea-config.json` +
-  `entitlements.plist` + ad-hoc `codesign`) build the four-platform signed
-  binaries attached to GitHub Releases.
-- **Release flow is OIDC-only.** `Actions -> Release` workflow_dispatch
-  publishes to npm via Trusted Publisher
-  (`freeCodeCamp-Universe/universe-cli/release.yml`). No `NPM_TOKEN`.
-  Prerelease versions (`*-alpha.*`, `*-beta.*`, `*-rc.*`) publish under a
-  non-`latest` dist-tag; `release.yml` derives `--tag` from the version string.
