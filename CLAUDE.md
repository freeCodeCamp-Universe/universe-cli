# universe-cli

Staff-facing TypeScript CLI for deploying, promoting, and rolling back static sites on the freeCodeCamp Universe platform. CLI talks to the **artemis** deploy proxy (`uploads.freecode.camp`); R2 admin credentials never leave the cluster.

## Doc Index

- **Ownership model** — [`~/DEV/fCC-U/Universe/CLAUDE.md`](../Universe/CLAUDE.md) is the source of truth for which team owns which doc across the platform.
- **Field notes** — historical journal frozen at [`Universe/spike/field-notes/archive/2026-05-10/universe-cli.md`](../Universe/spike/field-notes/archive/2026-05-10/universe-cli.md). New findings open a fresh file under [`Universe/spike/field-notes/`](../Universe/spike/field-notes/) per its README — do not extend the archive, and do not write findings into this repo.
- **Authoritative spec** — [`~/DEV/fCC-U/Universe/decisions/016-deploy-proxy.md`](../Universe/decisions/016-deploy-proxy.md) (ADR-016). Defines CLI ↔ artemis contract, identity priority chain, and per-site authorization model.
- **Contributor overview** — [`docs/README.md`](docs/README.md): architecture, repo layout, build & test, internal conventions, upstream specs, cross-repo runbooks, field notes. Read this first when changing CLI code. Sibling docs (each with explicit audience banner): [`docs/STAFF-GUIDE.md`](docs/STAFF-GUIDE.md) (staff deploy walkthrough), [`docs/platform-yaml.md`](docs/platform-yaml.md) (site-author schema reference), [`docs/RELEASING.md`](docs/RELEASING.md) (release-maintainer playbook).
