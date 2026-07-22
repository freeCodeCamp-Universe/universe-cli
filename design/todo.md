# TODO

## Phase 1: Schema and filtering foundation

- [x] CODE: Add `recommended` field to layer schemas
  - Feature: Extend `RuntimeSchema`, `FrameworkSchema`, and `PackageManagerSchema` with an optional `recommended: boolean` field so template data carrying the property is parsed and accessible on the inferred types.
  - Files: `src/commands/create/layer-composition/schemas/layers.ts`
  - Acceptance:
    - `RuntimeSchema` parses entries with `recommended: true`, `recommended: false`, and without `recommended` (all three cases)
    - `FrameworkSchema` parses entries with and without `recommended`
    - `PackageManagerSchema` parses entries with and without `recommended`
    - Existing entries without `recommended` continue to parse without error (backward compatibility)
    - The `recommended` value is accessible on the inferred `Runtime`, `Framework`, and `PackageManager` types

- [x] CODE: Add recommended-aware filtering functions
  - Feature: Provide `recommendedRuntimeOptions`, `recommendedFrameworkOptions`, and `recommendedPackageManagerOptions` functions that return only options where `recommended !== false`, treating absent `recommended` as recommended.
  - Files: `src/commands/create/layer-composition/allowed-configuration.ts`
  - Acceptance:
    - `recommendedRuntimeOptions` returns runtime keys where `recommended` is `true` or absent, excludes keys where `recommended` is `false`
    - `recommendedFrameworkOptions` returns frameworks that are both in the runtime's `frameworks` array AND have `recommended !== false` on the framework entry
    - `recommendedPackageManagerOptions` returns package managers that are both in the runtime's `packageManagers` array AND have `recommended !== false` on the PM entry
    - When no entries have a `recommended` field, all entries are returned (backward compat)
    - When all entries have `recommended: false`, an empty array is returned

- [x] TASK: Update test fixtures with `recommended` values
  - Add `recommended` fields to `tests/fixtures/templates/layers/runtime.json` and related fixture files (framework, package-manager JSONs) to exercise >1, =1, and =0 recommended counts
  - Consider adding a secondary fixture (e.g. `runtime-no-recommended.json`) for the zero-recommended edge case

## Phase 2: Interactive prompt filtering

- [x] CODE: Widen `ClackPrompt` constructor to accept framework and package-manager registry data
  - Feature: `ClackPrompt` constructor accepts `Framework` and `PackageManager` registry data alongside the existing `Runtime` and `Labels` parameters, storing them for use in recommended filtering.
  - Files: `src/commands/create/prompt/clack-prompt.ts`
  - Acceptance:
    - Constructor signature is `(runtimeData, labels, frameworks, packageManagers, api?)`
    - The `Framework` and `PackageManager` data is stored as private readonly fields

- [x] CODE: Apply 0/1/N recommended filtering to runtime prompt
  - Feature: The runtime selection step uses `recommendedRuntimeOptions` and applies uniform 0/1/N logic: 0 recommended throws `UsageError`, 1 recommended auto-selects without prompting, >1 recommended shows a select prompt with only the recommended options.
  - Files: `src/commands/create/prompt/clack-prompt.ts`
  - Acceptance:
    - When >1 runtimes are recommended, `select` is called with only the recommended runtimes
    - When exactly 1 runtime is recommended, `select` is not called and the single runtime is used
    - When 0 runtimes are recommended, a `UsageError` is thrown with message mentioning "runtimes" and "update"

- [x] CODE: Apply 0/1/N recommended filtering to framework prompt
  - Feature: The framework selection step uses `recommendedFrameworkOptions` with the same 0/1/N logic as runtime.
  - Files: `src/commands/create/prompt/clack-prompt.ts`
  - Acceptance:
    - When >1 frameworks are recommended for the selected runtime, `select` is called with only those
    - When exactly 1 framework is recommended, `select` is not called and the single framework is used
    - When 0 frameworks are recommended, a `UsageError` is thrown with message mentioning "frameworks"

- [x] CODE: Apply 0/1/N recommended filtering to package manager prompt
  - Feature: The package manager selection step uses `recommendedPackageManagerOptions` with the same 0/1/N logic, replacing the old special-case skip-when-0 / auto-select-when-1 behaviour.
  - Files: `src/commands/create/prompt/clack-prompt.ts`
  - Acceptance:
    - When >1 package managers are recommended, `select` is called with only those
    - When exactly 1 package manager is recommended, `select` is not called and the single PM is used
    - When 0 package managers are recommended, a `UsageError` is thrown with message mentioning "package managers"

- [x] CODE: Wire framework and package-manager registry data into `ClackPrompt` construction
  - Feature: The `ClackPrompt` instantiation in `create()` passes `registry.frameworks` and `registry["package-managers"]` to the constructor.
  - Files: `src/commands/create/index.ts`
  - Acceptance:
    - `new ClackPrompt(...)` call at line 128 passes four positional arguments: `registry.runtime`, `labels`, `registry.frameworks`, `registry["package-managers"]`
    - Existing interactive flow continues to work end-to-end with recommended filtering active

## Phase 3: Non-interactive defaults

- [x] CODE: Default to first recommended value in non-interactive mode
  - Feature: When no explicit `--runtime`, `--framework`, or `--packageManager` flag is provided in non-interactive mode, default to the first recommended value instead of the first value from the full list. Error with `UsageError` when no recommended value exists and no explicit flag is provided.
  - Files: `src/commands/create/index.ts`
  - Acceptance:
    - When `--runtime` is omitted, the first recommended runtime is used
    - When `--framework` is omitted, the first recommended framework for the selected runtime is used
    - When `--packageManager` is omitted, the first recommended PM for the selected runtime is used
    - When no recommended runtime exists and `--runtime` is omitted, a `UsageError` is thrown
    - When no recommended framework exists and `--framework` is omitted, a `UsageError` is thrown
    - When no recommended PM exists and `--packageManager` is omitted, a `UsageError` is thrown
    - When an explicit flag provides a non-recommended value, it is honoured (validation handles invalid values)

## Traceability Matrix

| Requirement ID | TODO Item | Status |
| --- | --- | --- |
| Change 1 — Schema | Phase 1 / CODE: Add `recommended` field to layer schemas | mapped |
| Change 2 — Filters | Phase 1 / CODE: Add recommended-aware filtering functions | mapped |
| Change 8 — Fixtures | Phase 1 / TASK: Update test fixtures with `recommended` values | mapped |
| Change 4.1 — Constructor | Phase 2 / CODE: Widen `ClackPrompt` constructor | mapped |
| Change 4.2 — Runtime prompt | Phase 2 / CODE: Apply 0/1/N recommended filtering to runtime prompt | mapped |
| Change 4.3 — Framework prompt | Phase 2 / CODE: Apply 0/1/N recommended filtering to framework prompt | mapped |
| Change 4.4 — PM prompt | Phase 2 / CODE: Apply 0/1/N recommended filtering to package manager prompt | mapped |
| Change 5 — Wiring | Phase 2 / CODE: Wire framework and PM registry data into `ClackPrompt` | mapped |
| Change 6 — Non-interactive | Phase 3 / CODE: Default to first recommended value in non-interactive mode | mapped |
| NFR-1 — Backward compat | Phase 1 / CODE: Add `recommended` field (optional field) + Phase 1 / CODE: Filtering functions (`!== false`) | mapped |
| NFR-2 — Validation unchanged | No TODO needed — validation intentionally uses full lists, not recommended subset | mapped |
