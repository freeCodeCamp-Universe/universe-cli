---
name: add-framework
description: Interactively adds a new framework to the layers-composition system. Asks the user for the framework name, its runtime, display label, an optional boilerplate directory, and then makes all required code changes across allowed-layer-combinations.json, frameworks-layer.ts, and prompt.port.ts.
allowed-tools: AskUserQuestion Read Edit Bash Glob
---

# Add Framework

Guide the user through registering a new framework in the layers-composition system.

## Step 1 - Gather information

Ask the user these questions **one at a time** using `AskUserQuestion`:

1. **Framework key** — the machine-facing ID used in code and config (e.g. `fastify`, `hono`, `vite`). Must be lowercase kebab-case.
2. **Runtime** — which runtime this framework targets. Present the two options:
   - `node` — Node.js (TypeScript)
   - `static_web` — Static (HTML/CSS/JS)
3. **Display label** — the human-readable name shown in the CLI prompt (e.g. `Fastify`, `Hono`, `Vite`).
4. **Boilerplate directory** — an optional path to a directory containing example starter files (e.g. `/tmp/my-fastify-app`). If provided, the files in that directory will be used to populate the layer. If omitted, hand-write a minimal starter instead.

## Step 2 - Build the file map

### If a boilerplate directory was provided

Copy all files from the boilerplate directory into `files/<framework-key>/`. If this contains any agent files e.g. CLAUDE.md or AGENTS.md, read them to better understand the framework. Do NOT read other files while copying.

After copying:

- Replace any hard-coded project name strings with `{{name}}` (rendered at build time).

**Dependency version normalisation** — if the boilerplate contains a `package.json`, convert every dependency version to a caret major-only range before inlining it:

- `^1.2.3` → `^1`
- `~1.2.3` → `^1`
- `1.2.3` → `^1`
- `^0.9.1` → `^0` (preserve the major even when it is 0)

Apply this to all of `dependencies`, `devDependencies`, `peerDependencies`, and `optionalDependencies`.

### If no boilerplate directory was provided

Hand-write a minimal set of starter files appropriate for the runtime and framework. Model on the existing `express` (node) or `none` (static_web) entries in `frameworks-layer.ts`.

## Step 3 - Add metadata to configs

Open `src/commands/create/layers-composition/layers/frameworks.json`.

Add a new entry with the key `"<framework-key>"`:

```ts
"<framework-key>": {
   "devCopySource": "",
   "port": 0,
   "watchSync": []
},
```

The values for `devCopySource`, `port`, and `watchSync` depend on the framework. DO NOT GUESS. Ask the user if unsure.

- `devCopySource` is the Dockerfile entry that copies the source code into the container. E.g. "COPY src ./src/\nCOPY tsconfig.json ./".

- `port` is the default port to run on (e.g. `3000`).

- `watchSync` is an array of the mappings between source and container. E.g. `[{ "path": "src", "target": "/app/src" }]`.

## Step 4 - update layer schema

Open `src/commands/create/layer-composition/schemas/layers.ts`.

Add the framework key to `FrameworkOptionSchema`.

## Step 5 - Verify

Run `pnpm test` to confirm nothing is broken. If tests fail, diagnose and fix before finishing.

## Constraints

- Follow all rules in the `typescript-guidelines` skill when editing `.ts` files.
- The only files and folders that need changing when adding a framework are `/files` and `framework.json`.
- Do not add new test files.
