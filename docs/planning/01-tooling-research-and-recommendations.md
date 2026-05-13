# Tooling Research and Recommendations

This document captures the tooling research performed and the resulting recommendations.

## Research Goal

Identify the best CLI tooling stack to build a high-quality developer experience similar to Wrangler/Astro while implementing only the static deploy slice first.

## Reference Patterns Reviewed

- Wrangler (Cloudflare workers-sdk)
- Astro CLI
- Vercel CLI
- Netlify CLI
- clack prompts package
- AWS SDK v3 S3 client ecosystem
- Cloudflare R2 S3 compatibility docs
- rclone S3 backend capabilities and auth behavior

## Findings (Practical Summary)

### Command Architecture

- Large CLIs (Wrangler/Vercel) are modular and robust but can become heavy quickly.
- Astro-style lean architecture (small parser + lazy command modules) is better for greenfield CLI speed and maintainability.
- Recommendation: use lightweight command routing and keep command handlers isolated.

### Prompt/UI Layer

- clack is excellent for interactive DX and progressive feedback.
- clack is not a full command router; pair it with a command parser.
- Recommendation: keep clack for prompts/spinners/progress, use a dedicated parser for commands.

### S3-Compatible Storage Access

- AWS SDK v3 works well across AWS S3, Cloudflare R2, Ceph RGW, and MinIO with endpoint-based config.
- R2 docs explicitly show AWS SDK v3 usage with custom endpoint and region `auto`.
- Recommendation: implement core storage with `@aws-sdk/client-s3` and `@aws-sdk/lib-storage`.

### Why Not Shell Out to rclone for Core Deploy Logic

- rclone is strong operationally but less ideal as primary app logic for typed errors, JSON contracts, and unit testing.
- It is still useful as a credential source fallback.
- Recommendation: core deploy logic in TypeScript SDK code; rclone only for fallback config resolution.

### Credential Strategy

- CI should prefer env credentials.
- local dev should support rclone remote fallback.
- Recommendation: strict precedence and deterministic resolution, with partial-env failure behavior.

## Recommended Stack (Locked)

- Runtime: Node 20+
- Language: TypeScript
- Command parsing: `cac` (or equivalent lightweight parser)
- Interactive UX: `@clack/prompts`
- Storage API: `@aws-sdk/client-s3`, `@aws-sdk/lib-storage`
- Validation: `zod`
- YAML parsing: `yaml`
- File discovery: `tinyglobby` or `fast-glob`
- Concurrency: `p-limit`
- MIME detection: `mrmime` or `mime`
- Packaging: `tsup`
- Testing: `vitest` + S3-compatible integration targets

## Behavioral Recommendations

- Keep command handlers lazy-loaded for startup speed.
- Use strict `--json` machine output mode for CI.
- Always provide non-interactive operation in CI contexts.
- Use bounded concurrency uploads and retry transient failures.
- Preserve immutable deploy paths; aliases are the only mutable pointers.

## Vite-First Considerations

- Most users will build with Vite and deploy `dist` output.
- CLI should default to `dist` and remain build-tool agnostic.
- Do not execute `vite.config.js` dynamically in v1.
- Support Vite MPA outputs naturally by uploading generated files recursively.

## Final Direction Chosen

- Generic S3-compatible support from day one.
- Named rclone remote fallback with default `gxy-static`.
- Dirty git tree warning only (soft fail).
- Missing git hash hard fail unless `--force`.
