# Engineering Backlog (Ticket-Ready)

This backlog maps directly to US-01..US-13 with acceptance checks and test strategy.

## Program Metadata

- Program: Universe Static Deploy CLI
- Version target: v1.0
- Defaults: output `dist`, bucket `gxy-static-1`, rclone remote `gxy-static`
- Locked policy: dirty git warning only, missing git hash fails unless `--force`

## Epic 0 — Foundations

### TKT-0001: CLI skeleton and runtime envelope

Scope:

- command registry and subcommands
- shared runtime context
- standard output envelope for human and json modes

Acceptance:

- `universe static --help` lists planned commands
- `--json` produces valid envelope
- unknown commands return usage error code

Tests:

- parser and help snapshots
- error envelope schema tests

### TKT-0002: platform.yaml schema loader

Scope:

- zod schema for static config
- defaults and normalization
- safe merge behavior for init updates

Acceptance:

- valid config loads
- invalid config returns actionable errors
- unknown keys preserved

Tests:

- valid/invalid fixture matrix
- merge-preserves-unrelated-keys test

### TKT-0003: credential resolver (flags > env > rclone)

Scope:

- resolve env credentials
- parse rclone config and named remote
- deterministic precedence and error semantics

Acceptance:

- complete env overrides rclone
- partial env values fail
- missing/invalid remote fails clearly

Tests:

- precedence matrix unit tests
- malformed rclone config tests

### TKT-0004: storage adapter

Scope:

- S3 client creation
- put/get/list/head/delete helpers
- alias read/write helpers
- retries for transient errors

Acceptance:

- alias read/write roundtrip works
- list and pagination works
- retries are applied only to retryable failures

Tests:

- integration with S3-compatible endpoint
- retry behavior unit tests

## Epic 1 — Deploy Flow

### TKT-0101: deploy ID and git state

Maps: US-01

Acceptance:

- ID format `YYYYMMDD-HHMMSS-git7` UTC
- dirty repo emits warning but does not block
- missing hash fails unless `--force`
- with `--force` and no hash, ID suffix `nogit`

Tests:

- deterministic format tests
- dirty/no-git/force scenario matrix

### TKT-0102: output dir discovery and preflight

Maps: US-01, US-12

Acceptance:

- resolve output dir via precedence
- fail when missing/empty
- handle nested Vite MPA outputs

Tests:

- fixtures for empty/missing/non-empty outputs
- nested path normalization tests

### TKT-0103: upload engine

Maps: US-01

Acceptance:

- recursive upload to immutable prefix
- content-type and cache-control policy applied
- prints deploy ID on success

Tests:

- integration upload verification
- metadata assertions per file type

### TKT-0104: preview alias update after upload

Maps: US-02

Acceptance:

- writes deploy id to preview alias after successful upload
- alias object overwritten each deploy
- no alias mutation if upload fails

Tests:

- sequential deploy alias overwrite test
- failed upload no-alias-update test

### TKT-0105: CI mode and json output contract

Maps: US-03

Acceptance:

- env-only creds path works non-interactively
- `--json` includes deploy id/url/timestamp
- success exit 0, failure non-zero

Tests:

- json contract snapshots
- CI environment non-interactive e2e

## Epic 2 — Promote and Rollback

### TKT-0201: promote preview to production

Maps: US-04

Acceptance:

- reads preview alias and writes production alias
- prints promoted message
- fails when preview alias missing

Tests:

- missing preview alias test
- successful promote alias parity test

### TKT-0202: promote specific deploy id

Maps: US-06

Acceptance:

- accepts deploy id argument
- validates deploy exists
- supports target alias selection

Tests:

- invalid deploy id fails
- promote specific id to preview and production

### TKT-0203: rollback production

Maps: US-05

Acceptance:

- selects deploy immediately prior to current production
- updates production alias
- fails with one-deploy-only state

Tests:

- rollback with 1 deploy fails
- rollback with multiple deploys chooses correct target

## Epic 3 — Visibility Commands

### TKT-0301: list deploys

Maps: US-07

Acceptance:

- list newest-first
- mark preview/production alias bindings
- show timestamp/hash/size/file count
- default limit 10

Tests:

- sorting and parsing tests
- alias marker coverage tests

### TKT-0302: status command

Maps: US-08

Acceptance:

- shows preview and production deploy IDs
- includes timestamps and URLs
- displays not-set states

Tests:

- alias missing scenarios
- json status schema snapshots

### TKT-0303: deploy metadata index (recommended)

Supports: US-07/US-08 efficiency

Acceptance:

- metadata written at deploy time
- list/status prefer metadata and fallback correctly

Tests:

- metadata-present and metadata-missing paths

## Epic 4 — Cleanup and Destructive Operations

### TKT-0401: cleanup old deploys

Maps: US-09

Acceptance:

- default older-than 7 days
- dry-run default behavior
- aliased deploys never deleted
- `--confirm` executes deletion

Tests:

- dry-run candidate correctness
- confirmed deletion excluding aliases

### TKT-0402: delete-site command

Maps: US-10

Acceptance:

- requires `--site`
- requires `--confirm`
- deletes entire site prefix
- prints deletion summary

Tests:

- safety guard tests (missing flags)
- full prefix deletion integration test

## Epic 5 — Configuration UX

### TKT-0501: init command

Maps: US-11

Acceptance:

- prompts for static config fields
- validates domain formats
- writes or updates platform.yaml safely

Tests:

- domain validation unit tests
- update idempotency integration test

### TKT-0502: validate command with aggregated issues

Maps: US-12

Acceptance:

- reports all detected issues in one run
- includes config, creds, bucket, and output checks

Tests:

- aggregated issue list test fixtures
- end-to-end misconfiguration matrix

## Epic 6 — Optional Sync Trigger

### TKT-0601: sync trigger command

Maps: US-13

Acceptance:

- attempts immediate sync action when kubectl access exists
- warns and skips if unavailable
- prints status outcome

Tests:

- kubectl missing path test
- simulated success path test

## Cross-Cutting Quality Tickets

### TKT-0701: error and exit code standardization

- ensure stable machine code mapping and remediation text

### TKT-0702: json schema contract versioning

- introduce `schemaVersion` and snapshot contract tests

### TKT-0703: logging redaction

- redact credentials and sensitive endpoint fragments

### TKT-0704: integration harness

- reproducible S3-compatible integration environment

### TKT-0705: CI gates

- typecheck, lint, unit, integration, and contract tests

## Dependency and Delivery Order

1. Foundations (`TKT-0001`..`TKT-0004`)
2. Deploy path (`TKT-0101`..`TKT-0105`)
3. Promote/rollback (`TKT-0201`..`TKT-0203`)
4. Visibility (`TKT-0301`..`TKT-0303`)
5. Cleanup/destructive (`TKT-0401`..`TKT-0402`)
6. Config UX (`TKT-0501`..`TKT-0502`)
7. Optional sync (`TKT-0601`)
8. quality hardening (`TKT-0701`..`TKT-0705`)

## Milestones

- M1: Deploy MVP (US-01/02/03 + validate basics)
- M2: Promote/Rollback (US-04/05/06)
- M3: List/Status (US-07/08)
- M4: Cleanup/Delete-site (US-09/10)
- M5: Init/Validate polish + optional sync (US-11/12/13)

## Definition of Done (Global)

- acceptance checks implemented and passing
- unit and integration tests added
- json contract snapshots updated when outputs change
- exit code behavior documented and verified
- secrets redaction verified
- CI green
