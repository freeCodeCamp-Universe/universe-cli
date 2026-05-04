---
name: typescript-guidelines
description: Guidelines for writing TypeScript. Use when writing or modifying TypeScript files.
---

# TypeScript Guidelines

Follow these rules when writing TypeScript.

## Exports

- **Named exports only.** No default exports. Enforced by lint (`import/no-default-export`).
- Export types and values explicitly. Do not rely on re-exports from barrel files.
- Only one `export` and (optionally) `export type` per module:
  ```ts
  export { MyClass, myFunction };
  export type { MyUnion, MyInterface };
  ```
  and not
  ```ts
  export MyClass ...
  export myFunction ...
  ```

## Imports

- Use `import type` for type-only imports:
  ```ts
  import type { LevelDefinition } from "./level-definition.js";
  ```
- Always use the `.js` extension in import paths, even for `.ts` source files (ESM resolution):
  ```ts
  import { LevelLoader } from "./level-loader.js"; // correct
  import { LevelLoader } from "./level-loader"; // wrong
  ```
- Import in alphabetical order
  ```ts
  import { BevelLoader } from "./revel-loader"; // BevelLoader comes before LevelLoader
  import { LevelLoader } from "./level-loader"; // The classname takes precedence
  ```

## Magic numbers

- Avoid them. Use named constants instead.
  ```ts
  for(const n = 0; n < MAX_ITERATIONS; n++) // correct
  for(const n = 0; n < 10; n++) // wrong
  ```

## Types

- **Types are not centralized.** Each module defines and exports only the types it owns. There is no `types/` folder.
- Use `interface` for object shapes:
  ```ts
  export interface GridCoord {
    x: number;
    y: number;
  }
  ```
- Use `type` for unions and aliases:
  ```ts
  type GameState = "EDIT" | "RUN" | "WIN";
  export type { GameState };
  ```
- Declare a type privately, then export it separately — do not inline `export` on `type` aliases:
  ```ts
  type ToolType = "block" | "bouncePad" | "ramp";
  export type { ToolType };
  ```
- Avoid trivially inferrable types.
  ```ts
  const ballY: number = 0; // bad, TS knows 0 is a number
  const ballX = 0; // good, number can be inferred
  ```

## Naming

- File names use kebab-case: `level-loader.ts`, `grid-coord.ts`.
- Type and interface names use PascalCase: `LevelDefinition`, `GridCoord`.
- String union members use SCREAMING_SNAKE_CASE for state/enum-like values: `"EDIT"`, `"RUN"`, `"WIN"`.

## Classes

- Use classes for stateful services and loaders (e.g. `LevelLoader`).
- Prefer plain interfaces/types for data shapes — do not use classes as data containers.

## Lint

- All lint rules are enforced at `error` level (correctness, suspicious, pedantic, perf, style).
- Type-aware checking is enabled. Avoid patterns that require disabling lint rules.
- Do NOT modify the lint configuration. If necessary, add single line lint disables e.g `// oxlint-disable-next-line no-unused-vars`

## Keys

- Model domain choices as stable, machine-facing string IDs (not display text), e.g. node_ts, static_web.
- Derive union types from as const objects/arrays for type safety and autocomplete.
- Keep UI copy in separate label/description maps keyed by ID.
- Keep core services, validation, and lookups ID-only.

### When to use this pattern

- when options appear in both business logic and UI text.
- when wording may change or need to be localized.
- when values are persisted (files/config/API) and need backward compatibility.
