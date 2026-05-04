# Layer File Repository

## Overview

Move scaffold file contents out of inline JSON strings into real files on disk. A codegen
script reads those files and injects the `files` key back into the layer JSONs before
tests and at build time. The runtime code is unchanged. SEA compatibility is preserved.

## Goals

- Scaffold files are editable as real files with proper tooling (syntax highlighting,
  formatting, etc.)
- Layer JSONs contain only metadata; file content is generated
- No changes to the composition runtime or to SEA bundling
- Committed JSONs always reflect the current `/files/` state (codegen output is versioned)

---

## New Directory Structure

```
files/                          ← project root, alongside src/
  always/
    always/
      .gitkeep                  ← sentinel; excluded from generated files key
      .dockerignore
      .gitignore
      README.md
  runtime/
    node/
      .gitkeep
      Procfile
      package.json
    static_web/
      .gitkeep
      Procfile
  package-manager/
    bun/
      .gitkeep
      .dockerignore
    pnpm/
      .gitkeep
      .dockerignore
      pnpm-workspace.yaml
  framework/
    express/
      .gitkeep
      package.json
      tsconfig.json
      src/
        index.ts
    html-css-js/
      .gitkeep
      package.json
      public/
        index.html
        main.js
        styles.css
    react-vite/
      .gitkeep
      eslint.config.js
      index.html
      package.json
      tsconfig.app.json
      tsconfig.json
      tsconfig.node.json
      vite.config.ts
      src/
        App.css             ← zero-byte file; valid
        App.tsx
        global.css
        main.tsx
    typescript/
      .gitkeep
      package.json
      tsconfig.json
      src/
        index.ts
  service/
    analytics/
      .gitkeep
      universe/
        services/
          analytics.md
    auth/
      .gitkeep
      universe/
        services/
          auth.md
    email/
      .gitkeep
      universe/
        services/
          email.md
  database/
    postgresql/
      .gitkeep
      universe/
        services/
          postgresql.md
    redis/
      .gitkeep
      universe/
        services/
          redis.md
```

**Key rules:**

- Every JSON entry MUST have a corresponding folder in `/files/{type}/{key}/`
- Every folder MUST contain a `.gitkeep` file (allows git to track otherwise-empty folders)
- `.gitkeep` is always excluded from the generated `files` map
- If a folder contains only `.gitkeep`, the generated `files` value is `{}`
- Every JSON entry MUST have a `files` key after codegen runs (possibly `{}`)

---

## JSON Source Format

The hand-maintained JSON contains only metadata — no `files` key, no `hasFiles` flag.
Codegen derives everything from the filesystem. After codegen runs, `files` is injected
into every entry. The committed JSON includes the generated `files` key.

```jsonc
// runtime.json — hand-maintained source
{
  "node": {
    "baseImage": "node:22-alpine",
    "databases": ["postgresql", "redis"],
    // "files" may or may not be present before codegen.
    "frameworks": ["express", "typescript"],
    "packageManagers": ["pnpm", "bun"],
    "services": ["analytics", "auth", "email"]
  }
}

// runtime.json — after codegen runs (what is committed)
{
  "node": {
    "baseImage": "node:22-alpine",
    "databases": ["postgresql", "redis"],
    "files": { "Procfile": "...", "package.json": "..." },
    "frameworks": ["express", "typescript"],
    "packageManagers": ["pnpm", "bun"],
    "services": ["analytics", "auth", "email"]
  }
}
```

### `always.json` restructuring

`always.json` gains a top-level key `"always"` for consistency with all other layer JSONs
(every other JSON is a record keyed by option name):

```json
{
  "always": {}
}
```

After codegen:

```json
{
  "always": {
    "files": { ".dockerignore": "...", ".gitignore": "...", "README.md": "..." }
  }
}
```

This means `layer-composition-service.ts` can simplify its registry construction:

```ts
// before
always: { always: alwaysLayer },

// after (alwaysLayer is already keyed)
always: alwaysLayer,
```

---

## Codegen Script

**Location:** `scripts/generate-layer-files.mjs`

Written as plain ESM JavaScript (no TypeScript) so it runs directly with
`node scripts/generate-layer-files.mjs` without any transpiler.

**Logic:**

```
assert: for each subfolder found in files/{type}/, a corresponding JSON entry exists
  → fail with informative error if not (stale folder detected)

assert: for each JSON entry, a corresponding folder exists in files/{type}/{key}/
  → fail with informative error if not (missing folder)

for each JSON entry:
  walk files/{type}/{key}/ recursively
  collect all files EXCEPT .gitkeep
  set entry.files = { "relative/path": "utf-8 content", ... }  (may be {})

write each JSON back to disk (2-space indent)
```

Both validation assertions run before any writes, so the script either succeeds fully
or fails cleanly with no partial output.

**Layer type → directory name mapping:**

| JSON file              | `/files/` subdirectory |
| ---------------------- | ---------------------- |
| `always.json`          | `always`               |
| `runtime.json`         | `runtime`              |
| `package-manager.json` | `package-manager`      |
| `framework.json`       | `framework`            |
| `service.json`         | `service`              |
| `database.json`        | `database`             |

**Path resolution:** use `import.meta.url` + `fileURLToPath` + `path.resolve` to find
project root regardless of where the script is invoked from.

**Standalone usage:** add to `package.json` scripts:

```json
"codegen": "node scripts/generate-layer-files.mjs"
```

---

## Vitest Integration

Add a global setup file at `scripts/vitest-setup.mjs`. It imports and runs the codegen
before any test workers start.

```js
// scripts/vitest-setup.mjs
import { generateLayerFiles } from "./generate-layer-files.mjs";

export async function setup() {
  await generateLayerFiles();
}
```

Wire it up in `vitest.config.ts`:

```ts
export default defineConfig({
  test: {
    globalSetup: ["./scripts/vitest-setup.mjs"],
    // ...existing config
  },
});
```

**Why globalSetup and not setupFiles:** `globalSetup` runs once in the main process
before worker processes start, which means JSON files are written before any module
imports them. `setupFiles` runs inside workers after modules are already cached.

---

## Exclusions

### TypeScript

`tsconfig.json` — add to `exclude`:

```json
"files/**"
```

This is inherited by `tsconfig.build.json` automatically. Scaffold `.ts`/`.tsx` files
(react-vite, express, typescript framework) contain template variables like `{{name}}`
and import packages not installed in this project — TypeScript must not touch them.

### Oxlint

Add `files/**` to the oxlint ignore config (`.oxlintrc.json` or a `.oxlintignore` file,
whichever the project uses). Same reason as TypeScript.

### Vitest test discovery

`/files/` is at the project root, outside `src/`. Vitest's default `include` pattern
(`src/**/*.test.ts`) won't pick up anything in `/files/`. No additional config needed,
but verify after implementation.

### lint-staged

Oxlint respects ignore rules even when called with explicit file paths, so staged files
in `files/**` should be silently skipped. Verify this works after implementation —
if not, add an explicit exclusion to the lint-staged config in `package.json`.

---

## Schema Changes

In `src/commands/create/layer-composition/schemas/layers.ts`:

- No `hasFiles` property needed anywhere
- The `files: z.record(z.string(), z.string())` key **remains required** in all schemas —
  codegen always populates it (possibly as `{}`)
- `AlwaysSchema` changes from `z.strictObject({ files: ... })` to a record keyed by
  `z.literal("always")`, matching the new `{ "always": { files: ... } }` shape

`RuntimeLayerData` currently picks `"baseImage" | "files"` — no change needed.
Runtime code needs no defensive `?? {}` since `files` is always present post-codegen.

---

## Validation

Codegen performs both integrity checks before writing:

1. **Stale folder check** (folder → JSON entry): for each subfolder found under
   `files/{type}/`, assert the corresponding JSON key exists. Fails with:
   `Error: stale folder files/framework/old-name/ has no entry in framework.json`

2. **Missing folder check** (JSON entry → folder): for each JSON entry, assert
   `files/{type}/{key}/` exists. Fails with:
   `Error: framework.json entry "new-name" has no folder at files/framework/new-name/`

<!-- In `validity.test.ts`, add a codegen smoke test: run codegen and assert it exits cleanly.
This catches any filesystem/JSON mismatch that would surface at build time rather than
only when someone manually runs `pnpm codegen`. --> No, don't add a test. Just get the user to run the tests when the codegen should fail (both ways). Why? Because the codegen runs during tests and so should flag up if there are issues without needing a dedicated smoke test.

---

## Affected Files (summary)

| File                               | Change                                         |
| ---------------------------------- | ---------------------------------------------- |
| `files/**`                         | Created (new scaffold file tree)               |
| `scripts/generate-layer-files.mjs` | Created (codegen script)                       |
| `scripts/vitest-setup.mjs`         | Created (vitest globalSetup)                   |
| `layers/always.json`               | Restructured to `{ "always": {} }`             |
| `layers/runtime.json`              | Remove `files` key (codegen repopulates)       |
| `layers/package-manager.json`      | Remove `files` key                             |
| `layers/framework.json`            | Remove `files` key                             |
| `layers/service.json`              | Remove `files` key                             |
| `layers/database.json`             | Remove `files` key                             |
| `schemas/layers.ts`                | Update `AlwaysSchema`; no other schema changes |
| `layer-composition-service.ts`     | `always: alwaysLayer` (drop manual wrapper)    |
| `layers/validity.test.ts`          | Add codegen smoke test                         |
| `vitest.config.ts`                 | Add `globalSetup`                              |
| `package.json`                     | Add `codegen` script                           |
| `tsconfig.json`                    | Exclude `files/**`                             |
| `.oxlintrc.json` (or ignore file)  | Exclude `files/**`                             |

---

## Implementation Order

1. Create `/files/` tree with all scaffold files and `.gitkeep` sentinels
2. Write `scripts/generate-layer-files.mjs` and verify it round-trips correctly
   (run it against the current JSONs, confirm output matches existing `files` content)
3. Strip `files` keys from all layer JSONs; restructure `always.json`
4. Re-run codegen to confirm JSON files are fully restored
5. Update `AlwaysSchema` in `layers.ts` and the `always:` line in
   `layer-composition-service.ts`
6. Add TypeScript and lint exclusions
7. Wire up Vitest globalSetup and add `codegen` script to `package.json`
8. Run full test suite; fix any failures
9. Add codegen smoke test to `validity.test.ts`
10. Run tests again; all should pass
