# Session Handoff Guide

Use this file to resume work in future sessions without context loss.

## Read Order

1. `docs/04-static-cli-spec-v0.3.md` (active source of truth)
2. `docs/03-engineering-backlog.md` (ticket map)
3. `docs/01-tooling-research-and-recommendations.md` (why these choices)
4. `docs/00-source-inputs.md` (full original context and user stories)

## Locked Decisions

- Dirty git tree is warning-only.
- Missing git hash fails unless `--force`.
- rclone named remote fallback defaults to `gxy-static`.
- default static output directory is `dist`.
- default bucket is `gxy-static-1`.

## Current State (2026-04-13)

Epic 0-2 COMPLETE — deploy, promote, rollback implemented and E2E validated against live R2 bucket `gxy-static-1`. 180 tests across 20 files.

Backlog tickets completed: TKT-0001 through TKT-0004, TKT-0101 through TKT-0105, TKT-0201 through TKT-0203.

## Next Practical Steps

1. **Infra wiring** — Caddy route config + DNS wildcard `*.freecode.camp` on gxy-static to serve deployed files via HTTP. This is infra repo work, not CLI work.
2. **Epic 3 — Visibility** (TKT-0301 list, TKT-0302 status, TKT-0303 metadata index)
3. **Epic 4 — Cleanup** (TKT-0401 cleanup, TKT-0402 delete-site)
4. **Epic 5 — Config UX** (TKT-0501 init, TKT-0502 validate)
5. **Epic 6 — Optional sync trigger** (TKT-0601)
6. **Upload proxy** — pre-signed URL service for developer self-service without direct R2 keys

## Notes

- Keep v0.2 spec as archival baseline.
- If behavior changes, update v0.3 and add a changelog section instead of overwriting prior rationale.
- S3 test research at docs/05-s3-test-research.md — recommends aws-sdk-client-mock (unit) + direct R2 (integration).
- Field notes at Universe/spike/field-notes/universe-cli.md — E2E findings and architectural decisions.
