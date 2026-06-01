# universe-cli

Staff-facing TypeScript CLI to deploy/promote/rollback static sites on freeCodeCamp Universe. Talks to the **artemis** proxy (`uploads.freecode.camp`); R2 admin keys never leave the cluster.

## Doc Index

- **Ownership** — [`Universe/CLAUDE.md`](../Architecture/CLAUDE.md): which team owns which platform doc.
- **Spec** — [ADR-016](../Architecture/decisions/016-deploy-proxy.md): CLI ↔ artemis contract, identity chain, per-site authz.
- **Field notes** — archive frozen at [`Universe/spike/field-notes/archive/2026-05-10/universe-cli.md`](../Architecture/spike/field-notes/archive/2026-05-10/universe-cli.md). New findings → fresh file under [`Universe/spike/field-notes/`](../Architecture/spike/field-notes/). Never extend the archive or write findings into this repo.
- **Docs** — flat `docs/` (5 files): [`docs/README.md`](docs/README.md) = overview + architecture + dev + conventions (read before changing CLI code); `STAFF-GUIDE.md` = staff/admin/CI workflows; `reference.md` = commands, exit codes, identity, env; `platform-yaml.md` = schema; `RELEASING.md` = release flow.
