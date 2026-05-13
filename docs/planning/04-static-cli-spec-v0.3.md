# Universe Static Deploy CLI Specification (v0.3)

Status: Active implementation spec.

This document supersedes `docs/02-static-cli-spec-v0.2.md` for implementation execution while preserving all locked decisions made during discovery.

## 1) Scope and Intent

- Build the static deploy subsystem of the `universe` CLI.
- Focus on immutable deploys and alias-based release flow.
- Optimize for Vite static sites (including multi-page builds), while staying build-tool agnostic.

In scope:

- `init`, `validate`, `deploy`, `promote`, `rollback`, `list`, `status`, `cleanup`, `delete-site`, optional `sync`.

Out of scope:

- bucket provisioning, DNS, Caddy route setup, TLS, analytics provisioning, running build.

## 2) Locked Decisions (Do Not Re-open Without ADR)

- Dirty git tree is warning-only and does not block deploy.
- Missing git hash is a hard failure unless `--force`.
- Credential fallback uses a named rclone remote, default `gxy-static`.
- Default output directory is `dist`.
- Default bucket is `gxy-static-1`.

## 3) Vite-First Operational Model

- Most users run `vite build`, producing `dist`.
- CLI never executes `vite.config.js` in v1.
- CLI reads built files from resolved output directory and uploads as-is.
- Vite MPA output is supported naturally by recursive upload.

## 4) Storage Layout

```text
s3://gxy-static-1/{site}/
  deploys/
    {YYYYMMDD-HHMMSS}-{git7}/
  preview
  production
  _universe/
    deploys/{deploy-id}.json
```

Rules:

- Deploy prefixes are immutable.
- Alias files contain single-line deploy IDs.
- Aliases are the only mutable release pointers.

## 5) Config and Resolution

`platform.yaml` expected minimum:

```yaml
name: my-site
stack: static
domain:
  production: my-site.com
  preview: preview.my-site.com
static:
  output_dir: dist
  bucket: gxy-static-1
  rclone_remote: gxy-static
  region: auto
```

Resolution precedence:

1. flags
2. env
3. platform.yaml
4. defaults

Credential precedence:

1. env (`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT`, optional `S3_REGION`)
2. rclone remote

Error semantics:

- Partial env credential sets are invalid.
- No env+rclone partial mixing.

## 6) Deploy ID and Git Behavior

Deploy ID format:

- `YYYYMMDD-HHMMSS-{git7}` (UTC)

Git policy:

- dirty tree -> warning only
- missing hash -> fail unless `--force`
- `--force` + no hash -> `YYYYMMDD-HHMMSS-nogit`

Collision policy:

- If deploy key already exists, regenerate and retry up to bounded attempts.

## 7) Command Contract

### `universe static init`

- create or update static deployment config.
- prompt for site and domains.
- validate domain formats.
- preserve existing unrelated keys.

### `universe static validate`

- validate config fields, credentials, bucket access, and output dir.
- aggregate all detected issues in one run.
- non-zero exit on any error.

### `universe static deploy`

- resolve site/context
- validate preconditions
- create deploy ID
- upload files to immutable path
- write deploy metadata
- update preview alias
- output human or json result

### `universe static promote [deploy-id]`

- no argument: promote preview alias to production alias
- with argument: validate deploy exists, then update alias

### `universe static rollback`

- update production alias to previous chronological deploy.

### `universe static list`

- list deploys newest-first with alias markers.

### `universe static status`

- read preview/production aliases and show current state.

### `universe static cleanup`

- dry-run default, delete older deploys with `--confirm`, never delete aliased deploys.

### `universe static delete-site`

- requires `--site` and `--confirm`.

### `universe static sync` (optional)

- best-effort immediate sync trigger; skip with warning if unavailable.

## 8) Metadata and Caching

Per uploaded object:

- set `Content-Type` by extension.
- cache-control defaults:
  - html: `public, max-age=60, must-revalidate`
  - fingerprinted assets: `public, max-age=31536000, immutable`
  - other static assets: `public, max-age=3600`

## 9) JSON and Exit Code Contract

`--json` envelope fields:

- `schemaVersion`, `command`, `success`, `timestamp`
- plus command-specific `data` or error `code/message/issues`

Exit codes:

- `0` success
- `10` usage
- `11` config
- `12` credential
- `13` storage/endpoint
- `14` output directory
- `15` git precondition
- `16` alias state
- `17` deploy not found
- `18` missing confirm for destructive action
- `19` partial failure

## 10) Reliability, Safety, and Security

- Bounded concurrency uploads.
- Transient retry with backoff and jitter.
- Alias update only after successful upload.
- Never log secrets.
- Redact sensitive values in diagnostics.

## 11) Implementation Sequence

1. Foundations: command runtime, config, credentials, storage adapter.
2. Deploy path: preflight, deploy ID, upload, preview alias, json output.
3. Release controls: promote and rollback.
4. Visibility: list and status.
5. Safety operations: cleanup and delete-site.
6. Optional sync trigger.
7. hardening: test matrix and CI contracts.

## 12) Definition of Done

For each command/ticket:

- acceptance criteria pass
- unit + integration coverage added
- json contract snapshots updated when changed
- exit code behavior verified
- no secret leakage
