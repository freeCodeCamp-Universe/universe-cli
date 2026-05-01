# Remove `output` from HandlerResult

## Goal

Replace the `output: string` field in `HandlerResult` with injectable side-effecting output.
Human-readable output goes through an injected `Logger` (implemented by clack).
JSON output goes through a `writeJson` utility that calls `process.stdout.write` directly.

## Why

The current mixed model is inconsistent: some handlers return output strings, others write
via side effects or `deps.write`. The `output` field makes handlers responsible for formatting
their own result _and_ signals that the caller (dispatch → bin.ts) will write it, which is
only sometimes true.

The clean model: handlers own their output entirely via side effects. The caller only handles
Commander's own output (--help, --version, errors) and the exit code.

## DI policy

Inject what is **external or volatile** (clack: third-party, swappable, suppressible in tests).
Call directly what is **stable and fundamental** (process.stdout.write: part of the Node contract,
not going to change or be swapped).

`writeJson` is not injectable. Tests spy on `writeJson` itself rather than on
`process.stdout.write` — this lets them assert against structured arguments `(command, ok, data)`
rather than a raw JSON string.

## Steps

### 1. Create `src/output/logger.ts`

A shared `Logger` interface:

```ts
interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  success(msg: string): void;
  error(msg: string): void;
}
```

Export a `clackLogger` default that wraps `log` from `@clack/prompts`.
All handlers reference this type. The existing `DeployLog` interface goes away.

### 2. Create `src/output/write-json.ts`

```ts
const writeJson = (command: string, ok: boolean, data: Record<string, unknown>): void => {
  process.stdout.write(JSON.stringify(buildEnvelope(command, ok, data)) + "\n");
};
```

### 3. Update all handlers

- Add `log: Logger` to each handler's deps, defaulting to `clackLogger`
- Replace `deps.write` / any direct stdout calls with `writeJson(...)`
- Convert any handler still returning a non-empty `output` string to call `log.success(...)` instead
- Return `{ exitCode }` everywhere

Handlers currently returning non-empty output strings: `register`, `logs`, `status`,
`teardown`, `create`.

Handlers using `deps.write` for JSON: `deploy`, `list`, `promote`, `rollback`, `whoami`,
`login`, `logout` (audit each to confirm).

### 4. Remove `output` from `HandlerResult`

Once all handlers return `{ exitCode }`:

- Remove `output` from the `HandlerResult` interface in `src/commands/create/index.ts`
- Remove the `output` write in `bin.ts` (`process.stdout.write(`${output}\n`)`)
- Remove the `capturedOutput` / `output` handling in `dispatch.ts` that feeds `bin.ts`
  (Commander's own output — --help, --version, errors — is handled separately and stays)

### 5. Update tests

- Tests asserting `result.output` for human output → assert on injected log stub instead
- Tests asserting `result.output` for JSON output → `vi.spyOn` on `writeJson` instead,
  asserting against the structured `(command, ok, data)` arguments
