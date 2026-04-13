# Universe Static Deploy CLI Specification (v0.2)

Status: Draft locked for implementation planning.

This is the consolidated functional and technical specification for the static deploy slice of the `universe` CLI.

## 1. Goals

- Deploy static build artifacts (default `dist/`) to S3-compatible storage with immutable versioning.
- Use alias-based release management (`preview`, `production`).
- Support developer and CI workflows with reliable, deterministic behavior.
- Maintain safety guardrails for destructive operations.

## 2. Non-Goals

- DNS provisioning
- Caddy route provisioning
- bucket provisioning
- certificate management
- analytics provisioning
- executing build step

## 3. Primary Operating Model

- Build is done externally (`vite build` for most users).
- CLI uploads built files only.
- Deploys are immutable directories.
- Preview/production are mutable alias objects pointing to deploy IDs.

## 4. Storage Contract

Default bucket: `gxy-static-1`

Per-site prefix:

```text
s3://gxy-static-1/{site}/
  deploys/
    {YYYYMMDD-HHMMSS}-{git7}/
  preview
  production
  _universe/
    deploys/{deploy-id}.json
```

Alias files:

- key: `{site}/preview` or `{site}/production`
- content: single-line deploy ID (newline tolerated)

## 5. Vite-First Assumptions

- Most users are Vite static users.
- Default output folder is `dist`.
- Vite MPA output is supported without special logic.
- CLI does not eval or run `vite.config.js` in v1.

## 6. Config Contract (`platform.yaml`)

Expected shape:

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
  force_path_style: false
```

Validation rules:

- `stack` must be `static`.
- `domain.production` required unless `--site` provided.
- default `output_dir` is `dist`.
- default bucket is `gxy-static-1`.
- default remote is `gxy-static`.

## 7. Resolution Precedence

For runtime settings:

1. CLI flags
2. environment variables
3. `platform.yaml`
4. built-in defaults

Credentials precedence:

1. env vars: `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT`, optional `S3_REGION`
2. rclone remote (`gxy-static` default)

Rules:

- partial env credentials are an error.
- no mixed partial env+rclone resolution.

## 8. Git and Deploy ID Policy (Locked)

Deploy ID format:

- `YYYYMMDD-HHMMSS-{git7}` (UTC)

Policy:

- dirty tree: warning only (soft fail)
- missing git hash: hard fail unless `--force`
- with `--force` and no git hash: use suffix `nogit`

Collision policy:

- if deploy key exists, regenerate timestamp and retry up to bounded attempts.

## 9. Command Surface (v1)

- `universe static init`
- `universe static validate`
- `universe static deploy`
- `universe static promote [deploy-id]`
- `universe static rollback`
- `universe static list`
- `universe static status`
- `universe static cleanup`
- `universe static delete-site`
- `universe static sync` (optional)

## 10. Command Specifications

### 10.1 `static init` (US-11)

- Create or update `platform.yaml` for static deployment.
- Prompt for name, production domain, preview domain, output dir.
- Validate domains.
- Preserve unknown existing keys.
- Never provisions infrastructure.

### 10.2 `static validate` (US-12)

Checks:

- config exists and required fields are valid
- credentials resolvable (env or rclone)
- bucket reachable
- output dir exists and non-empty

Behavior:

- aggregate issues (not first-failure only)
- non-zero exit on any error

### 10.3 `static deploy` (US-01, US-02, US-03)

Flow:

1. resolve site/config/credentials/output dir
2. run preflight checks
3. derive deploy ID
4. upload all files to immutable deploy prefix
5. write deploy metadata
6. write `preview` alias to deploy ID
7. output human or JSON result

Failures:

- missing or empty output dir
- missing hash without `--force`
- credential or endpoint failure
- upload failure
- alias write failure (return non-zero, keep uploaded deploy)

### 10.4 `static promote [deploy-id]` (US-04, US-06)

- no arg: read preview alias and write production alias
- with arg: verify deploy exists and write target alias
- default target alias is production
- fails if required source alias missing or deploy not found

### 10.5 `static rollback` (US-05)

- read production alias
- list deploy IDs newest-first
- select deploy before current production
- update production alias
- fail if rollback target unavailable

### 10.6 `static list` (US-07)

- list deploy IDs newest-first
- mark alias binding (preview/production/both)
- show timestamp/hash/size/file count
- default limit 10

### 10.7 `static status` (US-08)

- read preview and production aliases
- show deploy IDs, parsed timestamps, URLs
- show `not set` when missing

### 10.8 `static cleanup` (US-09)

- select deploys older than threshold (default 7 days)
- never delete currently aliased deploys
- dry-run by default
- execute deletes only with `--confirm`

### 10.9 `static delete-site` (US-10)

- requires explicit `--site`
- requires explicit `--confirm`
- deletes entire site prefix
- reports summary

### 10.10 `static sync` (US-13, optional)

- best-effort immediate sync trigger
- if kubectl unavailable/unauthorized, warn and skip

## 11. Upload Metadata Policy

Per-file object metadata:

- `Content-Type` from extension
- `Cache-Control` default profile:
  - HTML: `public, max-age=60, must-revalidate`
  - fingerprinted assets: `public, max-age=31536000, immutable`
  - other assets: `public, max-age=3600`

## 12. JSON Output Contract

All `--json` outputs use a stable envelope:

```json
{
  "schemaVersion": "1",
  "command": "static deploy",
  "success": true,
  "timestamp": "2026-04-12T17:04:21Z"
}
```

Error responses include machine code and issues list.

## 13. Exit Codes

- `0` success
- `10` usage/flag error
- `11` config validation failure
- `12` credential failure
- `13` storage/endpoint failure
- `14` output dir invalid or empty
- `15` git precondition failure
- `16` alias state failure
- `17` deploy not found
- `18` destructive op missing confirm
- `19` partial failure

## 14. Reliability and Safety

- bounded upload concurrency
- retry transient failures with backoff+jitter
- alias write only after successful upload
- deploy artifacts remain immutable
- redact secrets in all user-facing logs

## 15. Implementation Stack

- parser: `cac`
- prompts UX: `@clack/prompts`
- storage: `@aws-sdk/client-s3`, `@aws-sdk/lib-storage`
- schema validation: `zod`
- yaml parsing: `yaml`
- file discovery: `tinyglobby` or `fast-glob`
- concurrency: `p-limit`
- mime mapping: `mrmime`
- tests: `vitest` + integration against S3-compatible endpoint
