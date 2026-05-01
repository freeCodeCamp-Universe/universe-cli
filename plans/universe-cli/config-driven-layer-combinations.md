# Config-driven layer combinations

## Motivation

The same data (which options are valid per runtime) is encoded twice — once in `clack-prompt.ts` (to populate prompts) and again in `create-input-validation-service.ts` (to validate input). A single JSON config drives both, removing duplication and making framework additions a pure data change.

## Prerequisites

Add `"resolveJsonModule": true` to `tsconfig.json` to enable typed JSON imports.

## Step 1 — Create `src/commands/create/allowed-layer-combinations.json`

```json
{
  "node": {
    "frameworks": ["typescript", "express", "none"],
    "databases": ["postgresql", "redis", "none"],
    "platformServices": ["auth", "email", "analytics", "none"],
    "packageManagers": ["pnpm", "bun"]
  },
  "static_web": {
    "frameworks": ["react-vite", "none"],
    "databases": ["none"],
    "platformServices": ["none"],
    "packageManagers": []
  }
}
```

`packageManagers` encodes the package manager rule: non-empty → required and restricted to those values; empty → forbidden. This replaces both any `"required"/"forbidden"` enum and the hardcoded `SUPPORTED_NODE_PACKAGE_MANAGERS` list.

## Step 2 — Create `src/commands/create/allowed-layer-combinations.ts`

Zod schema + parse at module load time. The parse throws if the JSON is malformed — surfaced by the e2e test, no dedicated unit test needed.

```ts
import { z } from "zod";
import raw from "./allowed-layer-combinations.json" with { type: "json" };

const RuntimeCombinationsSchema = z.object({
  frameworks: z.array(z.string()),
  databases: z.array(z.string()),
  platformServices: z.array(z.string()),
  packageManagers: z.array(z.string()),
});

const AllowedCombinationsSchema = z.record(z.string(), RuntimeCombinationsSchema);

export type RuntimeCombinations = z.infer<typeof RuntimeCombinationsSchema>;

export const allowedCombinations = AllowedCombinationsSchema.parse(raw);
```

## Step 3 — Refactor `create-input-validation-service.ts`

**Remove** all `SUPPORTED_*` constants:

- `SUPPORTED_NODE_FRAMEWORKS`
- `SUPPORTED_STATIC_FRAMEWORKS`
- `SUPPORTED_NODE_DATABASES`
- `SUPPORTED_NODE_SERVICES`
- `SUPPORTED_NODE_PACKAGE_MANAGERS`

Also remove the now-unused imports (`DATABASE_OPTIONS`, `PACKAGE_MANAGER_OPTIONS`, `PLATFORM_SERVICE_OPTIONS`).

**Import** `allowedCombinations` and `RuntimeCombinations` from `./allowed-layer-combinations.js`.

**Replace** `validateNodeSelections` and `validateStaticSelections` with a single `validateRuntimeSelections(input, config: RuntimeCombinations)`:

1. Framework: `config.frameworks.includes(input.framework)` — else throw `CreateUnsupportedFrameworkError`
2. Package manager:
   - If `config.packageManagers.length > 0`: `input.packageManager` must be present and in `config.packageManagers` — else throw `CreateUnsupportedCombinationError`
   - If `config.packageManagers.length === 0`: `input.packageManager` must be `undefined` — else throw `CreateUnsupportedCombinationError`
3. Databases: `ensureNoneExclusive` then `ensureAllowedValues` against `config.databases`
4. Platform services: same pattern against `config.platformServices`

**Update** `validateRuntimeAndCombinations`: look up `allowedCombinations[input.runtime]`; if `undefined` throw `CreateUnsupportedRuntimeError`; otherwise call `validateRuntimeSelections`. Remove the `NODE_RUNTIME`/`STATIC_RUNTIME` constants.

The `ensureNoneExclusive` and `ensureAllowedValues` helpers are unchanged.

## Step 4 — Refactor `clack-prompt.ts`

**Remove** all hardcoded option arrays:

- `NODE_FRAMEWORK_OPTIONS`, `STATIC_FRAMEWORK_OPTIONS`
- `NODE_DATABASE_OPTIONS`, `STATIC_DATABASE_OPTIONS`
- `NODE_SERVICE_OPTIONS`, `STATIC_SERVICE_OPTIONS`
- `NODE_PACKAGE_MANAGER_OPTIONS`

**Import** `allowedCombinations` from `../allowed-layer-combinations.js`.

**Rewrite** `getFrameworkOptions`, `getDatabaseOptions`, `getServiceOptions` to return `allowedCombinations[runtime].<field> as <OptionType>[]`. If the runtime is not in the config, return `[]` (the validation service will reject it).

**Update** the package manager prompt: show it only when `allowedCombinations[runtime]?.packageManagers.length > 0`; populate from `allowedCombinations[runtime].packageManagers as PackageManagerOption[]`.

**Remove** unused `FRAMEWORK_OPTIONS` constants that were only consumed by the now-deleted arrays (keep the import for `FRAMEWORK_LABELS`).

## Step 5 — Remove redundant tests from `clack-prompt.test.ts`

These tests assert specific config-data values rather than prompt behaviour:

| Test                                                          | Reason to remove                           |
| ------------------------------------------------------------- | ------------------------------------------ |
| `"filters framework options for Static runtime"`              | Asserts specific option values from config |
| `"includes TypeScript in framework options for Node runtime"` | Asserts specific config content            |

All other tests (prompt ordering, cancellation, return shape, validation messages) are unaffected.

## Step 6 — Remove redundant tests from `create-input-validation-service.test.ts`

| Test                                                    | Reason to remove |
| ------------------------------------------------------- | ---------------- |
| `"accepts typescript framework for Node runtime"`       | Config content   |
| `"accepts react-vite framework for static_web runtime"` | Config content   |
| `"rejects typescript framework for static_web runtime"` | Config content   |
| `"rejects express framework for static_web runtime"`    | Config content   |

Keep everything else — these test the validation _logic_ (name pattern, path exists, runtime lookup, none-is-exclusive, package manager presence/absence, allowed-values check) rather than what the config contains.

## Step 7 — Update `add-framework` skill

Replace the current Step 6 (edit validation service + add test) with:

> Open `src/commands/create/allowed-layer-combinations.json` and add the new framework key to the appropriate runtime's `"frameworks"` array.

After this refactor, adding a framework only requires changes to three files:

1. `allowed-layer-combinations.json` — add to the runtime's `frameworks` array
2. `frameworks-layer.ts` — add the layer entry
3. `prompt.port.ts` — add to `FRAMEWORK_OPTIONS` and `FRAMEWORK_LABELS`

## What stays unchanged

- `FRAMEWORK_OPTIONS` / `FRAMEWORK_LABELS` in `prompt.port.ts` — TypeScript types and display labels aren't config concerns
- `ensureNoneExclusive` / `ensureAllowedValues` helpers — pure logic, no coupling to data
- All tests not listed in steps 5–6
