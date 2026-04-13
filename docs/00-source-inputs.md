# Session Source Inputs (Verbatim Context)

This document captures the original source context provided during the planning session so no requirements are lost across sessions.

## Initial Request

User intent:

- Build a custom CLI similar in quality to Wrangler or Astro.
- Focus only on the static-site upload portion now.
- Research and guidance only at first; no implementation.

## ADR-007: Developer Experience

```md
# ADR-007: Developer Experience

**Status:** Accepted

## Context

Developers need to create constellations quickly, develop locally, and deploy without understanding Kubernetes. The platform is general-purpose — developers build anything (dashboards, APIs, games, marketing sites). Templates are one-time snapshots: once created, the developer owns the code.

## Decision

One unified `universe` CLI using [clack](https://github.com/bombshell-dev/clack) for scaffolding and operations. Docker Compose for local development. Buildpacks-first (no Dockerfile required).

### Naming

| Concept      | Name                                                                        |
| ------------ | --------------------------------------------------------------------------- |
| The platform | **Universe**                                                                |
| A cluster    | **Galaxy** (gxy-management, gxy-backoffice, gxy-launchbase, gxy-triangulum) |
| An app       | **Constellation**                                                           |
| The CLI      | `universe`                                                                  |

## The `universe` CLI

### Commands

| Command                  | Access                 | Purpose                                                    |
| ------------------------ | ---------------------- | ---------------------------------------------------------- |
| `universe create`        | All developers         | Scaffold a new constellation (interactive prompts)         |
| `universe register`      | All developers         | Register with the platform (create repo, provision infra)  |
| `universe deploy`        | All developers         | Manual deploy trigger (normally automatic via git push)    |
| `universe promote`       | All developers         | Promote preview → production (triggers reviewer approval)  |
| `universe rollback`      | All developers         | Rollback production to previous version                    |
| `universe logs <name>`   | All developers         | Tail logs for a constellation                              |
| `universe status <name>` | All developers         | Deployment status, URLs, health                            |
| `universe list`          | All developers         | List all registered constellations                         |
| `universe teardown`      | **Platform team only** | Deregister and archive a constellation (requires approval) |

### Two-step creation flow

**Step 1: Scaffold locally (`universe create`)**

```
$ universe create

┌  Create a new constellation
│
◆  Name?
│  my-awesome-app
│
◆  Runtime
│  ○ Node.js (TypeScript)
│  ○ Python
│  ○ Go
│  ○ Static (HTML/CSS/JS)
│
◆  Framework
│  ○ Express / Next.js / Fastify / Hono / None
│
◆  Database (pick any)
│  ☐ PostgreSQL  ☐ MongoDB  ☐ SQLite  ☐ Redis  ☐ None
│
◆  Platform services (pick any)
│  ☐ Auth (OIDC)  ☐ Email  ☐ Analytics
│
└  Created my-awesome-app/ locally
```

**Step 2: Register with the platform (`universe register`)**

```
$ cd my-awesome-app
$ universe register

┌  Registering constellation: my-awesome-app
│
◇  Created GitHub repo: freeCodeCamp-Universe/my-awesome-app
◇  Added to app registry
◇  Provisioning services...
◇  Configuring build pipeline
│
└  Registered! Push code to deploy.
    Preview: preview.my-awesome-app.com
    Production: my-awesome-app.com
```

Separation matters: scaffolding is free and local. Registration provisions real infrastructure (costs money, can fail).

## Composable Template Layers

Templates assembled from independent layers, not monolithic starters:

```
layers/
├── base/              # runtime: tsconfig/pyproject.toml/go.mod + Procfile
│   ├── node-ts/
│   ├── python/
│   ├── go/
│   └── static/
├── frameworks/        # contextual to runtime
│   ├── express/
│   ├── nextjs/
│   ├── fastify/
│   ├── flask/
│   └── ...
├── services/          # additive integrations
│   ├── postgres/      # DB client + DATABASE_URL
│   ├── mongodb/       # Mongo client
│   ├── sqlite/        # SQLite setup
│   ├── redis/         # Redis client (maps to Valkey under the hood)
│   ├── auth/          # OIDC middleware + JWT validation
│   ├── email/         # Email helper calling Account Service API
│   └── analytics/     # Script tag / SDK
└── always/            # every constellation gets these
    ├── platform.yaml
    ├── docker-compose.dev.yml
    ├── .gitignore
    └── README.md
```

CLI assembles: `base/{runtime}` + `frameworks/{framework}` + `services/{each}` + `always/`.

### `type: redis` naming

Developer-facing type in `platform.yaml` is `redis` (familiar). Under the hood, the platform runs Valkey (BSD 3-Clause, Redis fork). Developers don't need to know this.

### Buildpacks-first

Templates include a `Procfile` (not a Dockerfile):

```
web: node src/index.js
```

Cloud Native Buildpacks auto-detect the language and build the OCI image. If a developer includes a Dockerfile, the build pipeline uses BuildKit instead (ADR-003).

### `platform.yaml` generated from selections

```yaml
name: my-awesome-app
owner: developer-name

domain:
  production: my-awesome-app.com
  preview: preview.my-awesome-app.com

environments:
  preview: dev
  production: main

services:
  - type: postgres
    size: small
  - type: redis
  - type: auth
    scopes:
      - user:read:name
  - type: analytics

resources:
  size: small
  replicas:
    preview: 1
    production: 2
```

### Static constellations

Static sites (HTML/CSS/JS, docs, SPAs) don't need containers, pods, or databases. They use a separate, lighter deploy path.

**Architecture:** Build in CI → upload to Ceph RGW (S3) → shared Caddy proxy on a VM → Cloudflare CDN caches.

**Infrastructure:** NOT K8s. Static sites don't need Kubernetes. Caddy runs on a simple VM (or 2-3 VMs behind a load balancer for HA). Cloudflare CDN caches aggressively — the VMs are rarely hit after the first request.

```
Cloudflare CDN (caches static assets)
       │
       ▼
VM: Caddy (routes by Host header)
       │
       ▼
Ceph RGW (S3 endpoint on gxy-triangulum)
  → s3://static/{constellation}/deploys/{timestamp}-{hash}/
```

**Day 0:** 3 VMs running Caddy behind a load balancer (DO LB or Cloudflare round-robin). Ansible provisions all three. HA from the start — if one VM dies, the others serve traffic.

**Scaling:** Cloudflare CDN handles traffic. VMs are origin servers only. 3 VMs handle thousands of static sites. Add more if needed.

```yaml
# platform.yaml for a static constellation
name: my-docs-site
stack: static

domain:
  production: my-docs-site.com
  preview: preview.my-docs-site.com

environments:
  preview: dev
  production: main
```

**Immutable deploys with aliasing:**

```
s3://static/my-docs-site/
├── deploys/
│   ├── 20260401-143022-a1b2c3d/     # immutable, never modified
│   ├── 20260401-152510-d4e5f6a/
│   └── 20260402-103045-f0a1b2c/     # latest
├── production → 20260401-152510-d4e5f6a   # alias
└── preview → 20260402-103045-f0a1b2c      # alias
```

- **Deploy:** Woodpecker CI runs `npm run build` → uploads `dist/` to `s3://static/{name}/deploys/{timestamp}-{git-hash}/`
- **Alias:** Windmill flow updates Caddy config via admin API (preview or production → deploy ID)
- **Promote:** `universe promote` repoints production alias to the deploy from preview
- **Rollback:** `universe rollback` repoints production alias to the previous deploy ID
- **Cleanup:** Daily Windmill cron deletes deploys older than 7 days (except currently aliased)
- **Caddy:** Shared across all static constellations. Routes by Host header to the correct S3 deploy path. Config reload via admin API, zero downtime.

**What this avoids:** No container image, no ArgoCD Application, no Helm chart, no K8s. Just a VM + Caddy + S3 + Cloudflare.

**Onboarding for `stack: static`:** Windmill flow detects static stack and:

1. Creates S3 prefix in Ceph RGW
2. Adds route to shared Caddy config on the static VM
3. Creates DNS records in Cloudflare
4. Sets up Woodpecker pipeline (build + upload + alias)

### Template ownership

- One-time snapshot. No update mechanism.
- Developer owns all code after creation. Can modify, delete, or replace anything.
- Matches how create-next-app, create-vite, and create-t3-app work.

## Local Development

**Docker Compose** with good defaults. Each template ships a `docker-compose.dev.yml`.

### What `docker compose up` provides

- The constellation itself (hot-reloading)
- Local PostgreSQL / MongoDB / Redis (matching production)
- Mock auth service (stubbed BetterAuth returning test tokens)
- No-op analytics (accepts events, discards them)
- Local mail preview (mailpit/mailhog)
- Environment variables matching production names

### What it does NOT provide

- Real BetterAuth OIDC provider (mock is simpler for single-constellation dev)
- Real SES (use mailpit for email preview)
- Cross-constellation features (single-constellation dev is the unit)

### Developer workflow

```bash
git clone <constellation-repo>
docker compose up
# Constellation running at localhost:3000
# Local DB at localhost:5432
# Mail preview at localhost:8025
```

## What `universe register` does (behind the scenes)

1. Creates GitHub repo under `freeCodeCamp-Universe` org
2. Pushes scaffolded code
3. Appends to `platform/app-registry.yaml` (ADR-005)
4. Triggers Windmill onboarding flow (ADR-003):
   - Register OIDC client in BetterAuth
   - Register constellation in Account Service
   - Create DNS records (Cloudflare)
   - Configure GitHub Actions workflow (auto-build on push)
   - Create analytics site
   - Provision databases via operator CRDs

## Consequences

- Must build and maintain the `universe` CLI (TypeScript, published to npm)
- Must build and test layer combinations (runtime × framework × service matrix)
- Must maintain mock services for local dev (auth stub, analytics no-op)
- `universe register` is the critical path — orchestrates GitHub, Windmill, DNS, ArgoCD
- `universe teardown` is platform-team-restricted (prevents accidental infrastructure destruction)
- Adding a new runtime/framework/service = adding one layer, not updating all templates
```

## Additional Static Deploy CLI User Stories

```md
Static Deploy CLI — User Stories
=================================

Context: CLI for deploying built static sites to gxy-static (Caddy + R2).
Immutable deploys with timestamp-hash paths. Alias-based promotion.
R2 is source of truth; rclone sidecar syncs to Caddy local SSD.

Storage layout per site:
  s3://gxy-static-1/{domain}/
    deploys/
      {YYYYMMDD-HHMMSS}-{git-short-hash}/   # immutable
    production -> {deploy-id}                 # alias file
    preview -> {deploy-id}                    # alias file


DEPLOY
------

US-01: Push a built site to R2
  As a developer, I want to upload a local dist/ directory to R2 under
  a new timestamped deploy path so that my site is stored immutably.

  Acceptance:
  - Reads site name/domain from platform.yaml in cwd (or accepts --site flag)
  - Generates deploy ID: {YYYYMMDD-HHMMSS}-{git-short-hash}
  - Uploads dist/ contents to s3://gxy-static-1/{domain}/deploys/{deploy-id}/
  - Prints deploy ID on success
  - Fails if dist/ is empty or missing
  - Fails if no git hash available (dirty tree warning, --force to override)

US-02: Auto-alias preview on deploy
  As a developer, I want my deploy to automatically update the preview
  alias so I can see my changes immediately.

  Acceptance:
  - After successful upload, writes deploy ID to s3://.../{domain}/preview
  - Preview alias is a single-line file containing the deploy ID
  - Previous preview alias is overwritten (not appended)

US-03: Deploy from CI
  As a CI pipeline, I want to deploy non-interactively using environment
  variables for credentials so that builds auto-deploy on push.

  Acceptance:
  - Reads R2 credentials from env: S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_ENDPOINT
  - Falls back to rclone config if env vars not set
  - Exit code 0 on success, non-zero on failure
  - Machine-readable output with --json flag (deploy ID, URL, timestamp)


PROMOTE / ROLLBACK
------------------

US-04: Promote preview to production
  As a developer, I want to promote the current preview deploy to production
  so that reviewed changes go live.

  Acceptance:
  - Reads current preview alias
  - Writes that deploy ID to s3://.../{domain}/production
  - Prints: "Promoted {deploy-id} to production"
  - Fails if no preview alias exists

US-05: Rollback production
  As a developer, I want to rollback production to the previous deploy
  so I can recover from a bad release.

  Acceptance:
  - Lists deploys in reverse chronological order
  - Identifies the deploy before the current production alias
  - Updates production alias to that deploy ID
  - Prints: "Rolled back to {deploy-id}"
  - Fails if only one deploy exists (nothing to rollback to)

US-06: Promote a specific deploy
  As a developer, I want to promote a specific deploy ID to production
  so I can skip preview and deploy a known-good version.

  Acceptance:
  - Accepts deploy ID as argument
  - Validates deploy path exists in R2
  - Updates production alias
  - Works for both preview and production targets


LIST / STATUS
-------------

US-07: List deploys for a site
  As a developer, I want to see all deploys for my site so I can
  understand what's deployed and pick a version to rollback to.

  Acceptance:
  - Lists all deploy IDs under s3://.../{domain}/deploys/ in reverse chronological order
  - Marks which deploy is aliased to preview and production
  - Shows timestamp, git hash, and size
  - Supports --limit N (default 10)

US-08: Show current status
  As a developer, I want to see which deploys are live for preview
  and production so I know the current state.

  Acceptance:
  - Reads preview and production alias files
  - Prints deploy IDs, timestamps, and URLs
  - Shows "not set" if alias doesn't exist


CLEANUP
-------

US-09: Delete old deploys
  As a platform operator, I want to remove deploys older than N days
  (except aliased ones) so R2 storage doesn't grow unbounded.

  Acceptance:
  - Accepts --older-than N (days, default 7)
  - Never deletes a deploy that is currently aliased (preview or production)
  - Dry-run by default, --confirm to execute
  - Prints list of deploys that will be / were deleted

US-10: Delete a site entirely
  As a platform operator, I want to remove all deploys and aliases
  for a decommissioned site.

  Acceptance:
  - Accepts --site flag (required, no default from cwd)
  - Requires --confirm (no dry-run default for destructive op)
  - Deletes entire s3://.../{domain}/ prefix
  - Prints summary of what was removed


CONFIGURATION
-------------

US-11: Init a static site for deployment
  As a developer, I want to initialize my project for static deployment
  so the CLI knows where to push.

  Acceptance:
  - Creates or updates platform.yaml with stack: static and domain config
  - Prompts for: site name, production domain, preview domain
  - Validates domain format
  - Does not provision infrastructure (that's universe register)

US-12: Validate configuration before deploy
  As a developer, I want the CLI to validate my setup before uploading
  so I catch misconfigurations early.

  Acceptance:
  - Checks platform.yaml exists and has required fields
  - Checks R2 credentials are available (env or config)
  - Checks R2 bucket is reachable
  - Checks dist/ directory exists and is non-empty
  - Reports all issues, not just the first one


SYNC TRIGGER
------------

US-13: Trigger immediate Caddy sync
  As a developer, I want to force an immediate sync from R2 to Caddy
  local disk so I don't have to wait for the 5-minute rclone cron.

  Acceptance:
  - Triggers a pod restart or rclone exec in the Caddy pods
  - Requires kubectl access (warns if not available)
  - Optional: most deploys can tolerate the 5-min wait
  - Prints sync status or skips with message if no kubectl access


NON-GOALS (out of scope for this CLI)
--------------------------------------

- DNS record creation (handled by universe register / Windmill flow)
- Caddy route configuration (handled by ArgoCD ConfigMap)
- R2 bucket provisioning (handled by Windmill onboarding flow)
- TLS certificate management (handled by Cloudflare)
- Analytics setup (handled by Vector + ClickHouse pipeline)
- Build step (developer or CI runs their own build command)
```

## Vite-Specific Clarification and Project Layout

User clarification:

- The intended build tool is **Vite** (not Vitest).

Example Vite config shared:

```js
// vite.config.js
import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        about: resolve(__dirname, 'about.html'),
      },
    },
  },
})
```

Recommended project structure shared:

```text
src/
  components/       # reusable HTML partials (header, footer)
  styles/
    base.css        # resets, variables
    components.css  # per-component styles
    pages/          # page-specific styles
  scripts/
    main.js         # entry point, imports modules
    modules/        # feature-specific JS (nav.js, form.js)
  pages/            # additional .html files
vite.config.js      # multi-page input config
```
