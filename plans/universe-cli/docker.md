# Docker Layer System — Single-Service Dev Environment

## Goal

Generate a working local Docker dev environment as part of `universe create`, analogous to
the `getting-started-todo-app` reference project but scoped to the single-service apps the
CLI currently produces.

## Scope

**In scope:**

- Multi-stage `Dockerfile` (generated from a template + per-layer data contributions)
- `docker-compose.dev.yml` using `build:` + `target: dev` instead of a bare image
- Compose Watch (`develop.watch`) for live file sync and rebuild triggers
- `.dockerignore` to exclude noisy directories from the build context
- Package manager-specific install steps (pnpm) baked into the `dev` stage
- Extending the layer object type to `{ files, dockerfileData }`

**Deferred:**

- Database and platform service backing services in `docker-compose.dev.yml` (postgresql, redis, etc.)
- Reverse proxy tier (Traefik or similar)
- Production (`final`) Dockerfile stage
- Test Dockerfile stage
- Multi-service (separate client + backend) architecture
- Bun-as-package-manager on `node:22-alpine` (awkward: requires installing bun via npm;
  deferred until bun is treated as a runtime with its own base image)
- Migrating `services-layer` to the new `{ files, dockerfileData }` layer shape (see below)

## Layer object type

All layers are currently typed as `Record<string, string>` (file path → content). To
support data-driven Dockerfile generation without a special filename convention, the layer
type is extended to a structured object:

```typescript
interface LayerData {
  files: Record<string, string>;
  dockerfileData?: DockerfileData;
}

type LayerRegistry = Record<string, LayerData | undefined>;
```

`services-layer` is the one exception: it currently exports a flat
`Record<string, Record<string, string>>` and will be migrated to the new shape in a
follow-up. Until then it is handled with a shim in the composition service.

## DockerfileData schema

Each layer that participates in Dockerfile generation contributes a partial
`DockerfileData` object. The composition service merges these in layer order (later layers
overwrite earlier values for the same key):

```typescript
interface DockerfileData {
  baseImage?: string; // e.g. "node:22-alpine"
  devInstall?: string; // COPY + RUN install instructions for the dev stage
  devCopySource?: string; // COPY instructions for source files and config
  devCmd?: string[]; // JSON-array form of the CMD instruction
}
```

### Which layer owns each slot

| Slot            | Owner                 | Rationale                                                                                                                                                                                                                                                                                              |
| --------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `baseImage`     | framework layer       | The framework knows its build-time requirements; the runtime layer only describes the deployment target (static file host vs. Node server), which is independent of what tooling is needed to develop or build the app. e.g. Astro with static output still needs `node:22-alpine` during development. |
| `devInstall`    | package-manager layer | The package manager controls the lockfile name and install command.                                                                                                                                                                                                                                    |
| `devCopySource` | framework layer       | The framework determines the source layout and which config files must be present.                                                                                                                                                                                                                     |
| `devCmd`        | package-manager layer | The dev server is invoked via the package manager.                                                                                                                                                                                                                                                     |

`frameworks/none` (plain static HTML/CSS/JS) contributes no `dockerfileData` at all.
Because no `baseImage` is set, the composition service emits no `Dockerfile` — correct,
since raw static files need no build step.

## Dockerfile template

A JS template literal in a dedicated `dockerfile-template.ts` renders the final
`Dockerfile` from a complete `DockerfileData` object:

```typescript
export function renderDockerfile(data: Required<DockerfileData>): string {
  return `\
FROM ${data.baseImage} AS base
WORKDIR /app

FROM base AS dev
${data.devInstall}
${data.devCopySource}
CMD ${JSON.stringify(data.devCmd)}
`;
}
```

The composition service calls `renderDockerfile` after all layers have been merged, then
adds the result to the output file set as `Dockerfile`. If no layer contributes
`dockerfileData`, no `Dockerfile` is emitted (e.g. the static runtime).

## docker-compose.dev.yml structure

The base/node layer emits the skeleton with `image:` as a fallback. Each package-manager
layer merges in `build:` and `develop.watch` via the existing YAML merge rules:

```yaml
services:
  app:
    build:
      context: ./
      target: dev
    ports:
      - "3000:3000"
    develop:
      watch:
        - path: ./src
          action: sync
          target: /app/src
        - path: ./package.json
          action: rebuild
```

The `sync` action keeps source changes live without a full restart. The `rebuild` action
re-runs `docker compose up --build` when `package.json` changes.

## .dockerignore

Contributed as a `files` entry by the package-manager layer:

```
node_modules
dist
.git
```

## Integration with the layer system

### base/node layer

- `files`: `docker-compose.dev.yml` with `image: node:22-alpine` fallback
- `dockerfileData`: none — the runtime layer is concerned with the deployment target, not the build environment

### package-managers/pnpm layer

- `files`: `.dockerignore`; `docker-compose.dev.yml` fragment (merges `build:` + `develop.watch`)
- `dockerfileData`:
  ```typescript
  {
    devInstall: "COPY package.json pnpm-lock.yaml ./\nRUN corepack enable pnpm && pnpm install",
    devCmd: ["pnpm", "run", "dev"],
  }
  ```

### frameworks/express and frameworks/typescript layers

- `files`: existing source files unchanged
- `dockerfileData`:
  ```typescript
  {
    baseImage: "node:22-alpine",
    devCopySource: "COPY src/ ./src/\nCOPY tsconfig.json ./",
  }
  ```

### frameworks/none layer

- `dockerfileData`: none — no build step required, no `Dockerfile` emitted

### Static runtime

No `dockerfileData` contributed; no `Dockerfile` emitted. No change to existing behaviour.

### services-layer (deferred)

Currently exports a flat `Record<string, Record<string, string>>`. Migrating it to the new
`{ files, dockerfileData }` shape is deferred. The composition service will include a shim
to handle the old shape until migration is done.

## Example: Node + Express + pnpm output

After `universe create` with Node / Express / pnpm, the project root contains:

```
Dockerfile
docker-compose.dev.yml
.dockerignore
src/index.ts
package.json
pnpm-lock.yaml        # (generated after pnpm install)
tsconfig.json
...
```

Running `docker compose watch` starts the `app` container at `http://localhost:3000` and
syncs `./src` changes into the container without a restart.
