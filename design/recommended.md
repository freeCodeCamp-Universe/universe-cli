# Design: Filter create options by `recommended`

## Context

The latest template version adds an optional `recommended: boolean` property to
runtime, framework, and package-manager entries.  The CLI should use this to
narrow the choices shown to the user during `universe create`.

### Assumption: where `recommended` lives

Each layer type carries its own flag:

| Layer type      | Location in registry                              |
| --------------- | ------------------------------------------------- |
| Runtime         | `registry.runtime["node"].recommended`            |
| Framework       | `registry.frameworks["express"].recommended`      |
| Package manager | `registry["package-managers"]["pnpm"].recommended` |

A runtime's `frameworks` / `packageManagers` arrays still list **all**
compatible values.  The `recommended` flag on the framework / PM entry itself
determines whether it should be offered in the prompt.  This means
"recommended" is a global trait of the framework or PM, not per-runtime.

### Filtering rules (interactive)

For each selection step (runtime, framework, package manager):

| Recommended count | Behaviour                                       |
| ----------------- | ----------------------------------------------- |
| > 1               | Prompt with only the recommended options        |
| = 1               | Skip the prompt; auto-select the single option  |
| = 0               | Throw a `UsageError` with an informative message |

All three categories (runtime, framework, package manager) use identical
logic — package manager always errors on 0 recommended, same as the others.

These rules do **not** apply to databases or platform services (no
`recommended` property on those types).

### Filtering rules (non-interactive / `--yes` / `--json`)

- If an explicit flag is provided (e.g. `--runtime node`), honour it even when
  the value is not recommended.  Validation already rejects unknown values.
- If no flag is provided, default to the **first recommended** value instead of
  the current behaviour of picking `[0]` from the full list.
- If no recommended value exists and no flag is provided, throw a `UsageError`.

### Backward compatibility

All `recommended` fields must be **optional** in the Zod schemas.  When a field
is absent (older template version), every entry is treated as recommended,
preserving current behaviour.

---

## Changes

### 1. Schema: add `recommended` to three layer schemas

**File:** `src/commands/create/layer-composition/schemas/layers.ts`

Add `recommended: z.boolean().optional()` to:

- `RuntimeSchema` entry object (the `z.strictObject` inside the `z.record`)
- `FrameworkSchema` entry object
- `PackageManagerSchema` entry object

No changes to `DatabaseSchema` or `ServiceSchema`.

Update test fixtures in `tests/fixtures/templates/` to include `recommended`
values that exercise all three count cases (>1, =1, =0).

### 2. Filtering helpers: add recommended-aware option functions

**File:** `src/commands/create/layer-composition/allowed-configuration.ts`

Add three new functions alongside the existing ones:

```ts
import type { Runtime, Framework, PackageManager } from "./schemas/layers.js";

/** Runtimes where `recommended` is true (or absent). */
const recommendedRuntimeOptions = (runtimeData: Runtime): string[] =>
  Object.entries(runtimeData)
    .filter(([, entry]) => entry.recommended !== false)
    .map(([key]) => key);

/**
 * Frameworks that are both compatible with the given runtime AND
 * recommended (or have no `recommended` field).
 */
const recommendedFrameworkOptions = (
  runtimeData: Runtime,
  runtime: string,
  frameworks: Framework,
): string[] =>
  runtimeData[runtime].frameworks
    .filter((f) => frameworks[f]?.recommended !== false);

/** Package managers that are both compatible AND recommended. */
const recommendedPackageManagerOptions = (
  runtimeData: Runtime,
  runtime: string,
  packageManagers: PackageManager,
): string[] =>
  runtimeData[runtime].packageManagers
    .filter((pm) => packageManagers[pm]?.recommended !== false);
```

> `!== false` means entries without the field are included (backward compat).

Export these alongside the existing un-filtered functions (validation still
needs the full lists).

### 3. Prompt port: widen constructor data

**File:** `src/commands/create/prompt/prompt.port.ts`

No change needed to the `Prompt` interface itself; the contract is still
`promptForCreateInputs(): Promise<CreateSelections | null>`.

### 4. ClackPrompt: use recommended filters

**File:** `src/commands/create/prompt/clack-prompt.ts`

1. **Constructor** — accept `Framework` and `PackageManager` registry data in
   addition to the existing `Runtime` and `Labels`:

   ```ts
   constructor(
     runtimeData: Runtime,
     labels: Labels,
     frameworks: Framework,
     packageManagers: PackageManager,
     api: ClackPromptApi = defaultClackApi,
   )
   ```

2. **Runtime prompt** — replace `runtimeOptions(this.runtimeData)` with
   `recommendedRuntimeOptions(this.runtimeData)`.  Apply the 1 / 0 rules:

   ```ts
   const runtimes = recommendedRuntimeOptions(this.runtimeData);
   if (runtimes.length === 0) {
     throw new UsageError("No recommended runtimes available — update your templates.");
   }
   let runtime: string;
   if (runtimes.length === 1) {
     runtime = runtimes[0];
   } else {
     runtime = await this.api.select({ ... });
   }
   ```

3. **Framework prompt** — same pattern with
   `recommendedFrameworkOptions(this.runtimeData, runtime, this.frameworks)`.

4. **Package manager prompt** — same pattern with
   `recommendedPackageManagerOptions(...)`.  The existing special-case logic
   (auto-select-when-1, skip-when-0) is replaced by the uniform
   recommended filtering: 0 = error, 1 = auto-select, >1 = prompt.

### 5. Wire new data into `ClackPrompt` construction

**File:** `src/commands/create/index.ts`

Update the `ClackPrompt` instantiation (line 129) to pass the additional
registry slices:

```ts
const prompt =
  deps.prompt ??
  new ClackPrompt(
    registry.runtime,
    labels,
    registry.frameworks,
    registry["package-managers"],
  );
```

### 6. Non-interactive defaults: prefer recommended

**File:** `src/commands/create/index.ts` (non-interactive branch, ~lines 146-171)

Replace the current "first from full list" defaults:

```ts
// Before
const runtime = options.runtime ?? runtimes[0];
const framework = options.framework ?? frameworks[0];

// After
const recRuntimes = recommendedRuntimeOptions(registry.runtime);
const runtime = options.runtime ?? recRuntimes[0];
if (runtime === undefined) {
  throw new UsageError("No recommended runtimes — specify --runtime explicitly or update templates.");
}

const recFrameworks = recommendedFrameworkOptions(registry.runtime, runtime, registry.frameworks);
const framework = options.framework ?? recFrameworks[0];
if (framework === undefined) {
  throw new UsageError(`No recommended frameworks for runtime "${runtime}" — specify --framework.`);
}

const recPMs = recommendedPackageManagerOptions(registry.runtime, runtime, registry["package-managers"]);
const pm = options.packageManager !== undefined
  ? (options.packageManager as PackageManagerOption)
  : recPMs.length === 1
    ? (recPMs[0] as PackageManagerOption)
    : undefined;
```

### 7. Validation: no changes required

`CreateInputValidationService` validates against the **full** option lists
(all compatible values for a runtime).  This is intentional: validation
ensures the combination is *valid*, not that it's *recommended*.  A
non-interactive user passing `--framework react-vite` when it is not
recommended should still succeed if the combination is valid.

### 8. Tests

#### `tests/commands/create/layer-composition/schemas/layers.test.ts`

Add parse-round-trip tests proving `recommended` is accepted and optional.

#### `tests/commands/create/layer-composition/allowed-configuration.test.ts`

Add tests for the three new `recommended*Options` functions:

- Returns only entries with `recommended: true` (or absent).
- Returns empty array when all entries have `recommended: false`.
- Preserves order from the original arrays / keys.

#### `tests/commands/create/prompt/clack-prompt.test.ts`

- **Auto-select**: when exactly 1 runtime / framework is recommended, the
  corresponding `select` prompt is never called and the value is used.
- **Error**: when 0 runtimes / frameworks are recommended, a `UsageError` is
  thrown with an actionable message.
- **Normal flow**: when >1 recommended, the prompt is shown with only those
  options.

#### `tests/commands/create/index.test.ts`

- Non-interactive mode defaults to the first recommended value.
- Non-interactive mode with an explicit non-recommended flag still succeeds.
- Non-interactive mode with no recommended values and no explicit flag errors.

#### Test fixtures

Update `tests/fixtures/templates/layers/runtime.json` (and framework / PM
fixture files) to include `recommended` fields.  Consider adding a
secondary fixture file (e.g. `runtime-no-recommended.json`) for the
zero-recommended edge case rather than mutating the primary fixture.

---

## Sequence: recommended filtering in interactive mode

```
loadLayers()
  │
  ▼
recommendedRuntimeOptions(registry.runtime)
  │
  ├── 0 → UsageError("No recommended runtimes")
  ├── 1 → auto-select, skip prompt
  └── N → show select prompt (recommended only)
  │
  ▼
recommendedFrameworkOptions(registry.runtime, runtime, registry.frameworks)
  │
  ├── 0 → UsageError("No recommended frameworks for …")
  ├── 1 → auto-select, skip prompt
  └── N → show select prompt (recommended only)
  │
  ▼
recommendedPackageManagerOptions(registry.runtime, runtime, registry["package-managers"])
  │
  ├── 0 → UsageError("No recommended package managers for …")
  ├── 1 → auto-select, skip prompt
  └── N → show select prompt (recommended only)
  │
  ▼
databases / services (unchanged)
  │
  ▼
confirmation
```

---

## Resolved decisions

1. **Auto-selected values in confirmation summary** — No special annotation.
2. **`--list-options` / help text** — Out of scope.
3. **PM zero-recommended** — Errors the same as runtime and framework.
   All three categories use identical 0 / 1 / N logic.
