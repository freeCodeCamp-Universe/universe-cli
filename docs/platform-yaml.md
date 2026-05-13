# `platform.yaml` — schema reference

`platform.yaml` lives at the repo root and tells `universe static deploy` what to build and how to deploy. It is the **only** config the CLI reads. Contract owner: ADR-016 (link in [`README.md`](README.md)).

## Minimal example

```yaml
site: my-site
```

That is a complete, valid file. The site builds with no build step (you ship pre-built artifacts) and uploads `dist/` to the preview channel.

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

Becomes the public URL: `<site>.freecode.camp` (production) and `<site>.preview.freecode.camp` (preview).

**Validation rules:**

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
| `preview` | boolean         | no       | `true`                                             | When `true`, `universe static deploy` publishes to preview unless `--promote` is passed.    |
| `ignore`  | array of string | no       | `["*.map", "node_modules/**", ".git/**", ".env*"]` | gitignore-style patterns applied to the upload set. Override **replaces** the default list. |

Omit `deploy:` entirely to take all defaults.

## Strict validation

The schema is **strict**: unknown keys at any level are rejected. Catches typos (`bukcet:`, `Site:`) up-front.

## See also

- [Staff Guide](STAFF-GUIDE.md) — deploy walkthrough that consumes this file.
- [`README.md`](README.md) — project overview.
