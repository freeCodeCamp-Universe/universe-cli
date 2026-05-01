# Universe CLI — Architecture Note

## Overview

Universe CLI uses ports and adapters for true external boundaries and internal services
for create-flow policy. Command handlers form the application layer; prompting,
filesystem writes, and observability remain behind port interfaces, while validation,
layer composition, and manifest generation are owned by internal services. No command
handler may import a concrete adapter directly.

---

## Layer Diagram

```
┌─────────────────────────────────────────────────────┐
│                  CLI Entry Point                    │
│  (wires adapters and services into the CLI flow)    │
└────────────────────┬────────────────────────────────┘
                     │ injects dependencies
┌────────────────────▼────────────────────────────────┐
│               Application / CLI Flow                │
│  src/cli.ts                                         │
│  · orchestrates command behavior                    │
│  · create is fully implemented in this spike        │
│  · other commands emit DeferredCommandError         │
└──────┬──────────────────────────────────────────────┘
       │ depends on
┌──────▼──────────────────────────────────────────────┐
│            Ports (external boundaries)              │
│  src/ports/                                         │
│  · observability-client.ts  ObservabilityClient     │
│  · prompt.ts                Prompt               │
│  · filesystem-writer.ts     FilesystemWriter        │
└──────┬──────────────────────────────────────────────┘
       │ implemented by
┌──────┴──────────────────────────────────────────────┐
│                   Adapters                          │
│  src/adapters/                                      │
│  · stub-observability-client.ts  (no-op, spike)     │
│  · clack-prompt-adapter.ts       terminal UI         │
│  · local-filesystem-writer.ts    local disk writes   │
└──────┬──────────────────────────────────────────────┘
       │ used alongside
┌──────▼──────────────────────────────────────────────┐
│             Internal Services (policy)              │
│  src/services/                                      │
│  · CreateInputValidationService                     │
│  · LayerCompositionService                          │
│  · PlatformManifestService                          │
└─────────────────────────────────────────────────────┘
```

---

## Layers

### CLI Entry Point

`src/bin.ts` wires concrete adapters and internal services, then calls `runCli()`.

### Application Flow

`src/cli.ts` parses the CLI command, orchestrates the create flow, and maps known
errors to the appropriate exit code. It may depend on both ports and internal
services, but it must not embed infrastructure-specific logic.

#### Argument Validation and Error Handling

All command handlers validate their arguments and throw a `BadArgumentsError` (exit code 18) for invalid or excessive arguments. This ensures consistent error handling and messaging for argument validation failures across all commands. The CLI entry point is responsible for catching this error and displaying the appropriate usage message to the user.

### Ports (`src/ports/`)

TypeScript interfaces that define only external boundaries. Ports are owned by the
application layer, not by the adapters that implement them.

| Port                  | Boundary                    |
| --------------------- | --------------------------- |
| `ObservabilityClient` | telemetry / error reporting |
| `Prompt`              | interactive terminal input  |
| `FilesystemWriter`    | project-folder writes       |

### Adapters (`src/adapters/`)

Concrete implementations of external-boundary ports. In the current spike, the key
adapters are the Clack prompt adapter, the local filesystem writer, and the stub
observability client.

### Internal Services (`src/services/`)

Internal services hold create-flow policy that does not cross a real infrastructure
boundary.

| Service                        | Responsibility                              |
| ------------------------------ | ------------------------------------------- |
| `CreateInputValidationService` | create-name and compatibility rules         |
| `LayerCompositionService`      | layer ordering, conflict detection, merging |
| `PlatformManifestService`      | runtime-specific manifest construction      |

### Container (`src/container.ts`)

Wires concrete adapters for external boundaries. Internal services may be constructed
in the CLI composition path, but they are not adapters and do not need port slots
unless a later design introduces a real boundary.

---

## Error Taxonomy and Exit Codes

See `src/errors/cli-errors.ts` for canonical error classes. Exit codes:

| Error Class       | Exit Code | Description                        |
| ----------------- | --------- | ---------------------------------- |
| BadArgumentsError | 18        | Invalid or excessive CLI arguments |

| Code  | Error Group / Example Classes                               |
| ----- | ----------------------------------------------------------- |
| 0     | Success                                                     |
| 1     | Unhandled error (reserved, never used by CLI directly)      |
| 2     | Shell builtin misuse (reserved, never used by CLI directly) |
| 3-125 | All custom CLI errors (see below)                           |

| 3 | `TargetDirectoryExistsError` |
| 4 | **Unsupported**: `CreateUnsupportedRuntimeError`, `CreateUnsupportedFrameworkError`, `CreateUnsupportedCombinationError` |
| 5 | `InvalidMultiSelectError` |
| 6 | **Layer**: `MissingLayerError`, `LayerConflictError` |
| 7 | `ScaffoldWriteError` |
| 8 | **Manifest**: `ManifestNotFoundError`, `ManifestInvalidError`|
| 9 | `RegistrationError` |
| 10 | `DeploymentError` |
| 11 | `PromotionError` |
| 12 | `RollbackError` |
| 13 | `LogsError` |
| 14 | `StatusError` |
| 15 | `ListError` |
| 16 | `TeardownError` |
| 17 | `InvalidNameError` |

**Exit Code Policy:**

- All custom CLI error exit codes must be between 3 and 125 (inclusive) based on the assumption this tool is to be used in [bash](https://tldp.org/LDP/abs/html/exitcodes.html)

**Grouping:**

- Related error classes (e.g., all "unsupported" errors) share a single exit code.

---

## Reclassification and Migration

Three classes that were initially placed in `src/adapters/` have been reclassified as
internal services. None of them cross a real infrastructure boundary — they contain
pure create-flow policy and are owned by the application layer.

| Old adapter name                 | Reclassified as                | Location        |
| -------------------------------- | ------------------------------ | --------------- |
| `DefaultCreateInputValidator`    | `CreateInputValidationService` | `src/services/` |
| `LocalLayerResolver`             | `LayerCompositionService`      | `src/services/` |
| `LocalPlatformManifestGenerator` | `PlatformManifestService`      | `src/services/` |

The corresponding port interfaces (`CreateInputValidator`, `LayerResolver`,
`PlatformManifestGenerator`) are deleted — they modelled no real external boundary.
`Prompt`, `FilesystemWriter`, and `ObservabilityClient` remain ports because they
represent genuine infrastructure boundaries (terminal I/O, disk writes, telemetry).

**Migration strategy:** imports are updated in a single pass per class. No
compatibility re-exports are introduced. The migration points are the `src/bin.ts`
entry point, the `CliDependencies` interface in `src/cli.ts`, and any test files that
import the old adapter names.

---

## Spike-Mode Guardrail

`src/container.test.ts` guards the observability wiring so spike mode does not
accidentally start using a real backend.

---

## Test Suites

All suites run under a single command: `pnpm test`.

| Suite           | Location pattern                            | Purpose                           |
| --------------- | ------------------------------------------- | --------------------------------- |
| Unit            | `src/**/*.test.ts`                          | Logic, validation, error taxonomy |
| Contract        | `src/adapters/*.test.ts`                    | Adapter ↔ port conformance        |
| CLI integration | `src/**/*.cli.test.ts` (Phase 1+)           | End-to-end command invocation     |
| Integration     | `src/integration-tests/*.test.ts` (Phase 4) | Full scaffold generation flows    |

---

## Error Taxonomy and Exit Codes

See `src/errors/cli-errors.ts` for canonical error classes. Exit codes:

| Code | Error                                                     |
| ---- | --------------------------------------------------------- |
| 0    | Success                                                   |
| 1    | `DeferredCommandError` — command not implemented in spike |
| 2    | `InvalidNameError`                                        |
| 3    | `TargetDirectoryExistsError`                              |
| 4    | `CreateUnsupportedRuntimeError`                           |
| 5    | `InvalidMultiSelectError`                                 |
| 6    | `MissingLayerError`, `LayerConflictError`                 |
| 7    | `ScaffoldWriteError`                                      |
| 8    | `ManifestNotFoundError`, `ManifestInvalidError`           |
| 9    | `RegistrationError`                                       |
| 10   | `DeploymentError`                                         |
| 11   | `PromotionError`                                          |
| 12   | `RollbackError`                                           |
| 13   | `LogsError`                                               |
| 14   | `StatusError`                                             |
| 15   | `ListError`                                               |
| 16   | `TeardownError`                                           |
| 17   | `InvalidNameError`                                        |

---

## Invariants

1. **Ports are for external boundaries only.** Internal policy stays in services.
2. **No adapter imports in core flow except at composition points.** The CLI flow depends on abstractions for infrastructure and on internal services for policy.
3. **O11y is best-effort.** All observability calls go through `safeTrack` / `safeError`; failures are swallowed and must not affect command exit codes.
4. **Deterministic layer composition.** Same inputs always produce the same resolved layer set.
5. **No partial scaffolds.** The filesystem writer rolls back on unrecoverable failure.
6. **Manifest validation remains portable.** `platform.yaml` is parsed with `yaml` into an in-memory object, validated with a `zod` schema, and that schema must remain JSON Schema-exportable to preserve a migration path away from `zod`.
