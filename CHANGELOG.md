# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-04-13

### Added

- `universe static deploy` — deploy a static site to R2 with preview URLs
- `universe static promote` — promote a preview deployment to production
- `universe static rollback` — rollback production to the previous deployment
- Node SEA binaries for macOS (Apple Silicon, Intel) and Linux x64
- npm distribution via `universe-cli` package with OIDC provenance
- `--json` flag on all commands for CI integration
- `platform.yaml` based site configuration
