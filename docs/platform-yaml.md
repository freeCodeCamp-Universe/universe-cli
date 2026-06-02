# `platform.yaml` — schema reference

The only config the CLI reads. It lives at your repo root and tells `universe static deploy` what to build and how to deploy. No credential fields — the proxy holds the R2 admin key. Schema source: [`../src/lib/platform-yaml.schema.ts`](../src/lib/platform-yaml.schema.ts); contract owner ADR-016. Workflow: [`STAFF-GUIDE.md`](STAFF-GUIDE.md).

## Minimal example

```yaml
site: my-site
```

A complete, valid file: no build step (ship pre-built artifacts), uploads `dist/` to preview. Run `universe init` to generate this file with the `site` and `build` fields pre-filled from your repo.

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

Every key here is at its default, so this behaves like the minimal example plus a `bun run build` step. Override `deploy.ignore` only when you need to change it.

## Fields

### `site` (required, string)

Becomes the public URL: `<site>.freecode.camp` (production) and `<site>.preview.freecode.camp` (preview). Pattern `^[a-z0-9]+(?:-[a-z0-9]+)*$` — lowercase letters, digits, single hyphens; 1–63 chars; no leading/trailing/consecutive hyphens.

| Example    | Valid? | Reason                |
| ---------- | ------ | --------------------- |
| `my-site`  | yes    | —                     |
| `1site`    | yes    | digits OK as first    |
| `My-Site`  | no     | uppercase             |
| `-site`    | no     | leading hyphen        |
| `my--site` | no     | consecutive hyphens   |
| `my_site`  | no     | underscore disallowed |
| 64+ chars  | no     | exceeds 63            |

> The site **registry** is stricter — its slug (`^[a-z][a-z0-9-]{0,62}$`) must start with a letter. A digit-initial name like `1site` validates here yet can never be registered or deployed. Keep slugs letter-initial.

### `build` (optional, object)

Omit if you upload pre-built artifacts. When present, the CLI runs `command` (if set) before collecting the upload set from `output`.

| Key       | Type   | Required | Default | Description                                  |
| --------- | ------ | -------- | ------- | -------------------------------------------- |
| `command` | string | no       | —       | Shell command run before deploy.             |
| `output`  | string | no       | `dist`  | Directory (relative to repo root) to upload. |

### `deploy` (optional, object)

| Key       | Type            | Required | Default                                            | Description                                         |
| --------- | --------------- | -------- | -------------------------------------------------- | --------------------------------------------------- |
| `preview` | boolean         | no       | `true`                                             | Publish to preview unless `--promote` is passed.    |
| `ignore`  | array of string | no       | `["*.map", "node_modules/**", ".git/**", ".env*"]` | gitignore-style patterns applied to the upload set. |

**`ignore` replaces, it does not merge.** Setting `deploy.ignore` discards the defaults entirely — to keep them, copy the four default patterns into your list. Glob forms: `*` (any run except `/`), `**` (any run including `/`), `?` (one non-`/` char); patterns with `/` anchor at the upload root, patterns without match a basename at any depth.

## Strict validation

The schema is **strict** at every level — unknown keys on the root, `build`, and `deploy` are rejected, catching typos (`bukcet:`, `Site:`, `previw:`) up front. Legacy v1 keys (`r2`, `bucket`, `region`, `stack`, `domain`, `static`, `name`) are rejected with a migration hint; credential and infrastructure paths no longer live in this file.
