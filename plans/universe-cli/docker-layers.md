# Docker Layer Architecture — Typed Responsibility Model

## Problem Statement

The current design distributes `dockerfileData` fragments across independent layers and assembles them with `Object.assign`. This produces three failure modes:

1. **Silent partial Dockerfile** — if any slot (`baseImage`, `devInstall`, `devCopySource`, `devCmd`) is missing, no `Dockerfile` is emitted and no error is raised.
2. **Compose drift** — `docker-compose.dev.yml` is assembled via YAML deep-merge from separate layer files. The resulting compose can reference a stage name, port, or sync path that no longer matches the generated `Dockerfile` or the app's listen port.
3. **Unowned consistency** — port, stage name, and run command are each declared in a different layer with no cross-check enforcing they agree.

## Design Decisions

### Responsibility Matrix

Each Docker-related property is owned by exactly one layer type:

| Property        | Owner           | Rationale                                                                  |
| --------------- | --------------- | -------------------------------------------------------------------------- |
| `baseImage`     | Runtime         | All frameworks within a runtime use the same base image.                   |
| `devCopySource` | Framework       | The framework determines the source layout.                                |
| `port`          | Framework       | The framework controls what port the app listens on.                       |
| `watchSync`     | Framework       | Which source paths to sync depends on the framework's directory structure. |
| `devInstall`    | Package manager | The package manager controls the lockfile name and install command.        |
| `devCmd`        | Package manager | The dev server is invoked via the package manager.                         |
| `watchRebuild`  | Package manager | Package config files that trigger a rebuild depend on the package manager. |

### Port template

The framework declares `port: number`. The same value is substituted into the framework's `package.json` `scripts.dev` via a `{{port}}` template placeholder (same mechanism as `{{name}}`). The assembly function uses `framework.port` for the compose `ports:` entry. This makes the port a single declaration that propagates — it cannot drift between `scripts.dev` and compose.

### Always require a package manager

Static web apps previously had no package manager (`packageManagers: []`). Under the new model, all runtimes require a package manager. This enables consistent tooling (linting, formatting, a dev server script) and removes the `npx serve` special case. `static_web.packageManagers` becomes `["pnpm", "bun"]`.

### Replace `frameworks/none`

`frameworks/none` currently serves both `node` (no framework) and `static_web` (plain HTML/CSS/JS). These have different `devCopySource` values, so `none` cannot serve both without runtime-awareness. The fix:

- Remove `none` from `node.frameworks`. The `typescript` framework is the minimal node setup.
- Replace `none` in `static_web.frameworks` with `html-css-js` — an explicit plain static framework with its own `devCopySource`, `port`, `watchSync`, and `package.json`.

### Assembly function replaces merging

A single `buildDockerfileData(runtime, framework, packageManager)` function assembles the complete `Required<DockerfileData>` from typed properties. TypeScript guarantees completeness at compile time — no `isCompleteDockerfileData` guard required. Similarly, a `buildComposeDevYaml(runtime, framework, packageManager)` function generates the complete compose YAML programmatically.

Both `Dockerfile` and `docker-compose.dev.yml` are removed from layer `files` and generated entirely by these functions.

---

## Functional Requirements

### REQ-1: New layer data interfaces

Replace the `dockerfileData?: DockerfileData` bag on `LayerData` with typed interfaces per layer category:

```ts
interface RuntimeLayerData {
  baseImage: string;
  files: Record<string, string>;
}

interface FrameworkLayerData {
  devCopySource: string;
  port: number;
  watchSync: WatchSyncEntry[];
  files: Record<string, string>;
}

interface PackageManagerLayerData {
  devCmd: string[];
  devInstall: string;
  watchRebuild: WatchRebuildEntry[];
  files: Record<string, string>;
}

interface WatchSyncEntry {
  path: string;
  target: string;
}

interface WatchRebuildEntry {
  path: string;
}
```

`LayerData` (used for always, services, databases) retains the current `{ files, dockerfileData? }` shape unchanged.

### REQ-2: Assembly function for Dockerfile

Add `buildDockerfileData(runtime: RuntimeLayerData, framework: FrameworkLayerData, packageManager: PackageManagerLayerData): Required<DockerfileData>`.

- `baseImage` ← `runtime.baseImage`
- `devCopySource` ← `framework.devCopySource`
- `devInstall` ← `packageManager.devInstall`
- `devCmd` ← `packageManager.devCmd`

Remove `mergeDockerfileData`, `isCompleteDockerfileData`, and `dockerfileData` from the layer registry and composition service. The function is called unconditionally when the composition service resolves a runtime + framework + package manager triple; the return type is always complete.

### REQ-3: Assembly function for docker-compose.dev.yml

Add `buildComposeDevYaml(runtime: RuntimeLayerData, framework: FrameworkLayerData, packageManager: PackageManagerLayerData): string`.

The generated YAML always has the structure:

```yaml
services:
  app:
    build:
      context: ./
      target: dev
    ports:
      - "<port>:<port>"
    develop:
      watch:
        # framework watchSync entries (action: sync)
        # package manager watchRebuild entries (action: rebuild)
```

Where `<port>` comes from `framework.port`. Remove `docker-compose.dev.yml` from `base-node-layer`, `base-static-layer`, and `package-managers/pnpm` layer files. The file is always generated by this function.

### REQ-4: Port template substitution

Add `port` to `TemplateContext` alongside `name`, `runtime`, and `framework`. The template renderer substitutes `{{port}}` in layer files using `framework.port`. Framework `package.json` files use `{{port}}` in `scripts.dev` rather than a hardcoded port number.

### REQ-5: `html-css-js` framework

Add a new `frameworks/html-css-js` entry to `frameworks-layer.ts`:

- `devCopySource: "COPY public public"`
- `port: 3000`
- `watchSync: [{ path: "./public", target: "/app/public" }]`
- `files`: `package.json` with `"dev": "serve public -l {{port}}"` and `serve` in `devDependencies`; a minimal `public/index.html`, `public/main.js`, `public/styles.css` (replacing the current `base-static-layer` public files)

Add `HTML_CSS_JS: "html-css-js"` to `FRAMEWORK_OPTIONS` and a corresponding entry in `FRAMEWORK_LABELS`.

### REQ-6: Remove `frameworks/none`

- Remove `none` from `node.frameworks` in `allowed-layer-combinations.json`.
- Remove `none` from `static_web.frameworks` in `allowed-layer-combinations.json`.
- Remove `frameworks/none` from `frameworks-layer.ts`.
- Remove `NONE` from `FRAMEWORK_OPTIONS` and `FRAMEWORK_LABELS` in `prompt.port.ts`.
- Update `static_web.frameworks` to `["react-vite", "html-css-js"]`.
- Update `node.frameworks` to `["typescript", "express"]`.

### REQ-7: `static_web` always has a package manager

- Set `static_web.packageManagers` to `["pnpm", "bun"]` in `allowed-layer-combinations.json`.
- The package manager prompt is shown for both runtimes. Auto-select silently when only one option is available (no user interaction) rather than showing a single-item list.

### REQ-8: Wire bun for Dockerfile generation

Add to `package-managers/bun`:

- `devInstall`: install bun and run `bun install` (exact instructions depend on base image decision — see constraints)
- `devCmd: ["bun", "run", "dev"]`
- `watchRebuild: [{ path: "./package.json" }, { path: "./bun.lock" }]`

### REQ-9: Wire node frameworks for new shape

Update `frameworks/express`, `frameworks/typescript`, and `frameworks/react-vite` to the `FrameworkLayerData` shape:

| Framework     | `port` | `devCopySource`                                                                 | `watchSync`                                     |
| ------------- | ------ | ------------------------------------------------------------------------------- | ----------------------------------------------- |
| `express`     | 3000   | `COPY src/ ./src/\nCOPY tsconfig.json ./`                                       | `[{ path: "./src", target: "/app/src" }]`       |
| `typescript`  | 3000   | `COPY src/ ./src/\nCOPY tsconfig.json ./`                                       | `[{ path: "./src", target: "/app/src" }]`       |
| `react-vite`  | 5173   | `COPY src src\nCOPY index.html .\nCOPY vite.config.ts .\nCOPY tsconfig*.json .` | `[{ path: "./src", target: "/app/src" }]`       |
| `html-css-js` | 3000   | `COPY public public`                                                            | `[{ path: "./public", target: "/app/public" }]` |

### REQ-10: Wire runtime layers for new shape

Update `base-node-layer` and `base-static-layer` to `RuntimeLayerData`:

- Both set `baseImage: "node:22-alpine"`.
- Remove `docker-compose.dev.yml` from their `files` (now generated).

### REQ-11: Invariant tests

Add tests that parse the generated output of each valid combination and assert cross-file consistency:

- compose `ports:` entry matches `framework.port`
- compose `build.target` (`dev`) matches the stage name in the `Dockerfile`
- `scripts.dev` in `package.json` contains the framework's port

---

## Non-functional Requirements

### NFR-1: Compile-time completeness

The `buildDockerfileData` and `buildComposeDevYaml` function signatures must guarantee a complete output via TypeScript's type system. No runtime completeness check (like `isCompleteDockerfileData`) should be required.

### NFR-2: Single port declaration

The framework's `port` property is the sole declaration of the port. It propagates to compose `ports:` and to `scripts.dev` via `{{port}}` substitution. The port cannot be stated in two separate places within a framework.

### NFR-3: Layer independence

No layer type's schema references another layer type's schema. Runtime layers do not import framework types; framework layers do not import package manager types.

---

## Out of Scope

- Database and platform service containers in compose (postgresql, redis, etc.)
- Production (`final`) Dockerfile stage
- Test Dockerfile stage
- Multi-service architecture (separate client + backend)
- Migrating `services-layer` to the new shape (remains shimmed)
- Adding new runtimes, frameworks, or package managers beyond those listed

---

## Constraints and Assumptions

- **Bun base image**: The `node` runtime uses `node:22-alpine` as `baseImage`. Bun is installed on top of it in `devInstall` (e.g. `RUN npm install -g bun`). The `oven/bun` image is reserved for a future `bun` runtime; that runtime is out of scope here.
- `FRAMEWORK_OPTIONS`, `FRAMEWORK_LABELS`, `RUNTIME_OPTIONS`, and `RUNTIME_LABELS` in `prompt.port.ts` remain the authoritative source for display labels and TypeScript types.
- `allowed-layer-combinations.json` remains the authoritative list of valid combinations.
- `react-vite`'s dev server must be reachable from outside the Docker container. The vite config or `devCmd` must pass `--host` (e.g. `"dev": "vite --host"`). This is a `frameworks/react-vite` file concern, not a new architecture concern.
- The `Procfile` (used for production process management) is out of scope for this redesign.
