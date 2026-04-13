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

## Next Practical Step

Start implementation from backlog Epic 0 in this order:

- `TKT-0001`: CLI skeleton
- `TKT-0002`: config schema loader
- `TKT-0003`: credential resolver
- `TKT-0004`: storage adapter

Then continue to deploy flow (`TKT-0101` through `TKT-0105`).

## Notes

- Keep v0.2 spec as archival baseline.
- If behavior changes, update v0.3 and add a changelog section instead of overwriting prior rationale.
