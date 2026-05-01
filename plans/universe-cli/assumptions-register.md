# Universe CLI Spike — Assumptions Register

This is a living document. New assumptions discovered during implementation should
be appended to the relevant section.

---

## Spike-Start Assumptions

| ID   | Assumption                                                                                                   | Impact if wrong                                                            | Expansion trigger                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| A-01 | CLI package distribution and release pipeline are out of scope for this spike.                               | Build / publish pipeline work deferred.                                    | When a real binary is needed for wider testing.                            |
| A-02 | Interactive-only `create` is sufficient to validate UX and architecture.                                     | Non-interactive scripting use-cases not covered.                           | When platform CI/CD pipelines need to call `create`.                       |
| A-03 | A curated runtime×framework×service matrix is preferable to partial implementations of all ADR-007 options.  | Unsupported paths raise explicit errors rather than partial results.       | When a deferred runtime (Python, Go) is prioritised by stakeholders.       |
| A-04 | Every generated project, including Static, includes `docker-compose.dev.yml` to preserve a unified local DX. | Static devs must use a different local-run command.                        | Reconsidered if static projects diverge from container-based DX.           |
| A-05 | `serve` is the single local webserver for Static projects in this spike.                                     | Alternative servers (Vite, Parcel) not evaluated.                          | When Static scaffold requires HMR or asset bundling.                       |
| A-06 | No lifecycle state store is needed beyond what `create` writes to disk.                                      | Post-`create` commands (`register`, `deploy`) have no local state to read. | When `register` is implemented and needs to persist registration metadata. |
| A-07 | Stub adapters are the only adapters wired in spike mode; no real platform APIs are called.                   | Any accidental real-adapter wire-up is a test-time failure via guard test. | Never relaxed within the spike; real adapters are a post-spike concern.    |

---

## Reduced-Matrix Decisions

| Decision                                                       | Rationale                                                        | Future expansion trigger                                                        |
| -------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Node.js (TypeScript) only; Python and Go deferred.             | Reduces template surface while validating the composition model. | Stakeholder demand or successful spike review.                                  |
| Express and None only for Node.js framework.                   | Simplest framework set that proves layer composition.            | Next.js, Fastify, or Hono added when framework-specific templates are authored. |
| PostgreSQL, Redis, Auth, Email, Analytics only (Node.js path). | Covers the most common service types without excess scaffolding. | MongoDB, SQLite added when additional template layers are authored.             |
| Static + None only (no databases or platform services).        | Static sites have no server-side resource needs in this spike.   | When Static projects evolve to support edge functions or BaaS.                  |
| No non-interactive (`--flag`) mode for `create`.               | Prompt-driven UX is the primary validation goal.                 | When scripting / headless environments are required.                            |

---

## Open Questions

| ID    | Question                                                                                                                    | Status                              |
| ----- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| OQ-01 | Should `serve` be provided via project `package.json` `devDependencies`, a Docker image default, or another packaging path? | Open                                |
| OQ-02 | What is the expected `platform.yaml` schema version when the real platform ships?                                           | Open — using ADR-007 shape for now. |
| OQ-03 | Will the 8 deferred commands share a common base class or remain independent handlers?                                      | Deferred to Phase 1 implementation. |

---

## Assumptions Added During Implementation

| ID  | Assumption | Impact if wrong | Expansion trigger |
| --- | ---------- | --------------- | ----------------- |

### Additional Unknowns Discovered

| ID    | Question                                                                                                | Status |
| ----- | ------------------------------------------------------------------------------------------------------- | ------ |
| OQ-04 | Should future `create` adapters expose a dry-run mode that returns resolved files without writing disk? | Open   |
| OQ-05 | Should layer registries support external overrides (for internal templates) before matrix expansion?    | Open   |
