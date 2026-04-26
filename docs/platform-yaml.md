# `platform.yaml` — schema reference

`platform.yaml` lives at the repo root and tells `universe deploy` what to
build and how to deploy. It is the **only** config the CLI reads.

This document covers schema **v2** (CLI v0.4+). For the v0.3 → v0.4
migration delta, see [Migration](#migration-v03--v04).

> **Locked by:** [Universe ADR-016 §`platform.yaml` schema](https://github.com/freeCodeCamp-Universe/Universe/blob/main/decisions/016-deploy-proxy.md), Sprint 2026-04-26 DECISIONS Q9–Q15.

## Minimal example

```yaml
site: my-site
```

That is a complete, valid file. The site builds with no build step (you
ship pre-built artifacts) and uploads `dist/` to the preview channel.

## Full example

```yaml
site: my-site

build:
  command: bun run build
  output: dist

deploy:
  preview: true
  ignore:
    - "*.map"
    - "node_modules/**"
    - ".git/**"
    - ".env*"
```

## Fields

### `site` (required, string)

Becomes the public URL: `<site>.freecode.camp` (production) and
`<site>.preview.freecode.camp` (preview).

**Validation rules** (carry-forward from D19 + D37):

- Lowercase letters, digits, single hyphens.
- 1–63 characters.
- No leading or trailing hyphen.
- No consecutive hyphens.

| Example    | Valid? | Reason                |
| ---------- | ------ | --------------------- |
| `my-site`  | yes    | —                     |
| `learn`    | yes    | —                     |
| `1site`    | yes    | digits OK as first    |
| `My-Site`  | no     | uppercase             |
| `-site`    | no     | leading hyphen        |
| `site-`    | no     | trailing hyphen       |
| `my--site` | no     | consecutive hyphens   |
| `my_site`  | no     | underscore disallowed |
| 64+ chars  | no     | exceeds 63            |

### `build` (optional, object)

Omit this block if you upload pre-built artifacts (e.g. CI built them).

| Key       | Type   | Required | Default | Description                                  |
| --------- | ------ | -------- | ------- | -------------------------------------------- |
| `command` | string | no       | —       | Shell command run before deploy.             |
| `output`  | string | no       | `dist`  | Directory (relative to repo root) to upload. |

If `build` is present, `output` defaults to `dist` even if you omit it.

### `deploy` (optional, object)

Controls how the artifact is published.

| Key       | Type            | Required | Default                                            | Description                                                                                 |
| --------- | --------------- | -------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `preview` | boolean         | no       | `true`                                             | When `true`, `universe deploy` publishes to preview unless `--promote` is passed.           |
| `ignore`  | array of string | no       | `["*.map", "node_modules/**", ".git/**", ".env*"]` | gitignore-style patterns applied to the upload set. Override **replaces** the default list. |

Omit `deploy:` entirely to take all defaults.

## Strict validation

The schema is **strict**: unknown keys at any level are rejected. This
catches accidental v1 fragments and typos (`bukcet:`, `Site:`) up-front.

## v1 detection (migration safety net)

Any of these v1 markers at the root produce a clear migration error
pointing at this document:

| v1 marker | Why removed in v2                                            |
| --------- | ------------------------------------------------------------ |
| `r2`      | Proxy holds R2 admin credentials; staff repos never see R2.  |
| `stack`   | Only `static` was ever supported; field is dead weight.      |
| `domain`  | Domain is derived from `site` server-side.                   |
| `static`  | `output_dir` moved to `build.output`; bucket is server-side. |
| `name`    | Renamed to `site` for clarity.                               |

Error template:

```
platform.yaml v1 detected. v0.4 removes credential paths (r2, bucket,
region) and per-site team declarations. See docs/platform-yaml.md for
the v0.3 → v0.4 migration. (v1 marker detected: `<marker>`)
```

## Migration: v0.3 → v0.4

### What's removed

| v0.3 field             | v0.4 home       | Why                                                                            |
| ---------------------- | --------------- | ------------------------------------------------------------------------------ |
| `name`                 | `site`          | Clearer noun.                                                                  |
| `stack: static`        | _(implicit)_    | Static is the only stack; field was redundant.                                 |
| `domain.production`    | _(server-side)_ | Becomes `<site>.freecode.camp`.                                                |
| `domain.preview`       | _(server-side)_ | Becomes `<site>.preview.freecode.camp`.                                        |
| `static.output_dir`    | `build.output`  | Output is a build concern, not a storage concern.                              |
| `static.bucket`        | _(removed)_     | Server-side; staff never write to R2 directly.                                 |
| `static.region`        | _(removed)_     | Server-side.                                                                   |
| `static.rclone_remote` | _(removed)_     | rclone replaced by upload microservice (`uploads.freecode.camp`, see ADR-016). |
| `r2.*` block           | _(removed)_     | Proxy holds R2 admin credentials (Q9 / Q12).                                   |

### Diff: minimal sites

**Before (v0.3)**

```yaml
name: my-site
stack: static
domain:
  production: my-site.freecodecamp.org
  preview: my-site-preview.freecodecamp.org
static:
  output_dir: dist
  bucket: gxy-static-1
  rclone_remote: gxy-static
  region: auto
```

**After (v0.4)**

```yaml
site: my-site
```

### Identity / authz

v0.4 removes per-site team declarations from `platform.yaml`. The
deploy proxy enforces team membership server-side via the static
site → team map (Q11). To request access to a site, contact the
infra team — the map lives in the proxy config, not in your repo.

### Credentials

You no longer need R2 tokens. `universe login` exchanges your
GitHub identity for a deploy session at the proxy
(`uploads.freecode.camp`). See the [Staff Guide](STAFF-GUIDE.md) for
the v0.4 onboarding flow.

## See also

- [Universe ADR-016 — Deploy proxy](https://github.com/freeCodeCamp-Universe/Universe/blob/main/decisions/016-deploy-proxy.md)
- [Sprint 2026-04-26 DECISIONS](https://github.com/freeCodeCamp/infra/blob/main/docs/sprints/2026-04-26/DECISIONS.md)
- [Staff Guide](STAFF-GUIDE.md)
