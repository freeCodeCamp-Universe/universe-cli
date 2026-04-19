# Universe CLI Flight Manual

> **Note (2026-04-20):** This runbook documents the pre-pivot direct-R2
> deploy flow. T16-T20 (gxy-cassiopeia RFC §4.8) replace this with a
> Woodpecker CI API integration. Do not rely on this document for new
> deploys after v0.4.0-beta.1 ships.

Platform team ops runbook for building, testing, and maintaining the CLI.

## Prerequisites

- Node 22+
- pnpm 10+
- rclone (for platform team credential fallback)

## Build

```sh
pnpm install
pnpm tsup
```

Output: `dist/index.js` (ESM) and `dist/index.cjs` (CJS for SEA).

## Test

```sh
pnpm vitest run
pnpm tsc --noEmit
```

## Release

See [RELEASING.md](../RELEASING.md).

## Credential Setup (Platform Team)

### R2 API Token

1. Open [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Select the account that owns `gxy-static-1`
3. Go to **R2 Object Storage** > **API Tokens**
4. Click **Create API token**
5. Set: Name `universe-cli-dev`, Permissions **Object Read & Write**, Scope **Specific bucket** > `gxy-static-1`
6. Save the Access Key ID, Secret Access Key, and Endpoint URL

### Credential Resolution Order

1. **Environment variables**: `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT` (all three required together)
2. **rclone remote** (fallback): named remote matching `static.rclone_remote` in platform.yaml (default `gxy-static`)

Config overrides for `platform.yaml`:

- `UNIVERSE_STATIC_OUTPUT_DIR`
- `UNIVERSE_STATIC_BUCKET`
- `UNIVERSE_STATIC_RCLONE_REMOTE`
- `UNIVERSE_STATIC_REGION`

Staff developers use env vars only. The rclone fallback exists for platform team workflows and CI pipelines.

### rclone Remote (ops only)

```sh
rclone config
# n > gxy-static > s3 > Cloudflare > paste keys > paste endpoint > defaults
```

Verify: `rclone ls gxy-static:gxy-static-1 --max-depth 1`

## Current Command Surface

Current shipped commands:

- `universe static deploy`
- `universe static promote [deploy-id]`
- `universe static rollback`

All commands support `--json`. JSON responses use a stable envelope with `schemaVersion`, `command`, `success`, and `timestamp`, plus command-specific fields or an error object.

Exit codes used by the shipped commands:

- `0` success
- `10` usage
- `11` config
- `12` credential
- `13` storage
- `14` output directory
- `15` git precondition
- `16` alias state
- `17` deploy not found
- `18` missing confirm
- `19` partial upload failure

## Troubleshooting

### Credential resolution fails

- For env vars: all three required together — `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT`
- For rclone fallback: verify `rclone config dump` shows the remote with `access_key_id`, `secret_access_key`, `endpoint`

### Deploy fails with "not a git repository"

- Run from a git-initialized directory, or use `--force` to skip git hash requirement
- A dirty working tree only emits a warning and does not block deploy

### tsup build fails

- Verify TypeScript compiles: `pnpm tsc --noEmit`
- Check tsup.config.ts entry point matches `src/index.ts`
