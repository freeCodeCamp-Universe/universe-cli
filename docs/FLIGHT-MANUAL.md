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
