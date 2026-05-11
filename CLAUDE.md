# universe-cli

Staff-facing TypeScript CLI for deploying, promoting, and rolling back
static sites on the freeCodeCamp Universe platform. CLI talks to the
**artemis** deploy proxy (`uploads.freecode.camp`); R2 admin credentials
never leave the cluster.

## Doc Index

- **Ownership model** — [`~/DEV/fCC-U/Universe/CLAUDE.md`](../Universe/CLAUDE.md)
  is the source of truth for which team owns which doc across the platform.
- **Field notes** — operational findings for this repo live upstream at
  [`Universe/spike/field-notes/universe-cli.md`](../Universe/spike/field-notes/universe-cli.md).
  Write findings there, not here.
- **Authoritative spec** — [`~/DEV/fCC-U/Universe/decisions/016-deploy-proxy.md`](../Universe/decisions/016-deploy-proxy.md)
  (ADR-016). Defines CLI ↔ artemis contract, identity priority chain, and
  per-site authorization model.
- **Operator index** — [`docs/README.md`](docs/README.md) maps the three
  workflows (use, build, release) + architecture + cross-repo runbooks.
  Most-used leaves: [`docs/STAFF-GUIDE.md`](docs/STAFF-GUIDE.md)
  (deploy / promote / rollback walkthrough),
  [`docs/RELEASING.md`](docs/RELEASING.md) (cut a CLI release),
  [`docs/platform-yaml.md`](docs/platform-yaml.md) (config schema).
