# Universe CLI Flight Manual

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

Staff developers use env vars only. The rclone fallback exists for platform team workflows and CI pipelines.

### rclone Remote (ops only)

```sh
rclone config
# n > gxy-static > s3 > Cloudflare > paste keys > paste endpoint > defaults
```

Verify: `rclone ls gxy-static:gxy-static-1 --max-depth 1`

## Troubleshooting

### Credential resolution fails

- For env vars: all three required together — `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT`
- For rclone fallback: verify `rclone config dump` shows the remote with `access_key_id`, `secret_access_key`, `endpoint`

### Deploy fails with "not a git repository"

- Run from a git-initialized directory, or use `--force` to skip git hash requirement

### tsup build fails

- Verify TypeScript compiles: `pnpm tsc --noEmit`
- Check tsup.config.ts entry point matches `src/index.ts`
