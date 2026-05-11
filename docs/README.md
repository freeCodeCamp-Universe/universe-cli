# Universe CLI — Operator Docs

Pick a workflow.

| I want to…                                                           | Start here                              |
| -------------------------------------------------------------------- | --------------------------------------- |
| **Use the CLI** to deploy / promote / rollback a static site         | [STAFF-GUIDE.md](STAFF-GUIDE.md)        |
| **Understand the architecture** — where the CLI sits in the platform | [§Architecture](#architecture) (below)  |
| **Build & test the CLI** locally                                     | [`CONTRIBUTING.md`](../CONTRIBUTING.md) |
| **Cut a release** of the CLI                                         | [RELEASING.md](RELEASING.md)            |
| **Write `platform.yaml`** for a site                                 | [platform-yaml.md](platform-yaml.md)    |

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
