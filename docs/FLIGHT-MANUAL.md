# Universe CLI Flight Manual

Rebuild and recovery runbook for the universe-cli static deploy CLI.

## Prerequisites

- Node 20+
- npm
- rclone (optional, for local dev credential fallback)

## Build

```sh
npm install
npx tsup
```

Output: `dist/index.js` (ESM bundle, bin entry point).

## Test

```sh
npx vitest run
```

## Release

_Release process not yet defined. Will be documented after CI pipeline is set up._

## Credential Setup

The CLI needs S3 credentials for the R2 bucket `gxy-static-1`.

### Create R2 API Token

1. Open [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Select the account that owns `gxy-static-1`
3. Go to **R2 Object Storage** > **API Tokens**
4. Click **Create API token**
5. Set:
   - Name: `universe-cli-dev`
   - Permissions: **Object Read & Write**
   - Scope: **Specific bucket** > `gxy-static-1`
6. Click **Create API Token**
7. Save the three values (secret shown only once):
   - Access Key ID
   - Secret Access Key
   - Endpoint URL (`https://<account-id>.r2.cloudflarestorage.com`)

### Credential Resolution Order

1. **Environment variables** (CI pipelines, manual testing):
   - `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT` — all three required together
   - Optional: `S3_REGION` (defaults to `auto`)
2. **rclone remote** (local dev, persistent):
   - Named remote `gxy-static` (or override via `static.rclone_remote` in platform.yaml)
   - CLI runs `rclone config dump` and parses the remote's JSON entry

Partial env sets (e.g., key without secret) are rejected.

### rclone Remote Setup

```sh
rclone config
# n → gxy-static → s3 → Cloudflare → paste keys → paste endpoint → defaults
```

Verify: `rclone ls gxy-static:gxy-static-1 --max-depth 1`

## Troubleshooting

### npm install fails

- Verify Node 20+ with `node --version`
- Delete `node_modules/` and `package-lock.json`, then retry

### tsup build fails

- Verify TypeScript compiles: `npx tsc --noEmit`
- Check tsup.config.ts entry point matches `src/index.ts`

### Credential resolution fails

- For env vars: all three required together — `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT`
- For rclone fallback: verify `rclone config dump` shows the `gxy-static` remote with `access_key_id`, `secret_access_key`, `endpoint`

### Deploy fails with "not a git repository"

- Run from a git-initialized directory, or use `--force` to skip git hash requirement
