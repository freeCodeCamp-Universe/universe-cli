---
name: typescript-test-guidelines
description: Additional guidelines for writing TypeScript. Use when writing or modifying TypeScript test files.
---

# TypeScript Test Guidelines

Follow these rules when writing TypeScript tests, these rules supplement those in `typescript-guidelines`

## Naming and organisation

- File names use kebab-case: `level-loader.test.ts`, `grid-coord.test.ts`.
- Unit test files are co-located with the source file: `level-loader.ts` → `level-loader.test.ts`.
- e2e tests should live in `src/e2e-tests`.
- integration tests should live in `src/integration-tests`.

## Test conventions

- Use `describe(ClassName, ...)` when testing a class i.e. pass the class directly to describe
- Use `describe(functionName, ...)` when testing a function i.e. pass the function directly to describe
- Use `describe("description in lowercase", ...)` for everything else.

## Preferred assertions

- `expect(array).toHaveLength(5)` rather than `expect(array.length).toBe(5)`
- `expect(isDone).toBe(true)` rather than `expect(isDone).toBeTruthy()`

## Mocks and spies

- Prefer mocks and spies over direct modifications to global object.
  ```ts
  vi.spyOn(Math, "random").mockReturnValue(0.123456789); // good, easily undo
  Math.random = () => 0.123456789; // bad
  ```

## Snapshots

- Don't use snapshots when a fixture or direct comparison will do. For example: `expect(aString).toMatchInlineSnapshot("some string")` is bad. Use `expect(aString).toBe("some string")` instead.
- Avoid large inline snapshots. If the snapshot is large, write it to a file.
