/**
 * Exit code constants — single source of truth for both codebases.
 *
 * Range allocation:
 *   0       — success
 *   3–9     — main: create/scaffold operations (no conflicts)
 *   10–19   — other: stable published codes (preserved exactly)
 *   21–31   — main: renumbered from former 10–20 collisions
 *
 * Codes 14 (EXIT_OUTPUT_DIR), 16 (EXIT_ALIAS), 17 (EXIT_DEPLOY_NOT_FOUND)
 * are reserved with no current callers — kept for stability.
 */

// ── Shared ───────────────────────────────────────────────────────────────────

const EXIT_SUCCESS = 0;

// ── Main: create/scaffold (3–9) ──────────────────────────────────────────────

const EXIT_TARGET_EXISTS = 3;
const EXIT_UNSUPPORTED = 4;
const EXIT_INVALID_MULTI_SELECT = 5;
const EXIT_LAYER = 6;
const EXIT_SCAFFOLD_WRITE = 7;
const EXIT_MANIFEST = 8;
const EXIT_REGISTRATION = 9;

// ── Other: stable published codes (10–19) ────────────────────────────────────

const EXIT_USAGE = 10;
const EXIT_CONFIG = 11;
const EXIT_CREDENTIALS = 12;
const EXIT_STORAGE = 13;
// Reserved — no current callers, kept for v0.3→v0.4 stability
const EXIT_OUTPUT_DIR = 14;
const EXIT_GIT = 15;
// Reserved — no current callers, kept for v0.3→v0.4 stability
const EXIT_ALIAS = 16;
// Reserved — no current callers, kept for v0.3→v0.4 stability
const EXIT_DEPLOY_NOT_FOUND = 17;
const EXIT_CONFIRM = 18;
const EXIT_PARTIAL = 19;

// ── Main: renumbered (21–31) ─────────────────────────────────────────────────

const EXIT_DEPLOYMENT = 21;
const EXIT_PROMOTION = 22;
const EXIT_ROLLBACK = 23;
const EXIT_LOGS = 24;
const EXIT_STATUS = 25;
const EXIT_LIST = 26;
const EXIT_TEARDOWN = 27;
const EXIT_INVALID_NAME = 28;
const EXIT_BAD_ARGUMENTS = 29;
const EXIT_PACKAGE_INSTALL = 30;
const EXIT_REPO_INITIALISATION = 31;

export {
  EXIT_ALIAS,
  EXIT_BAD_ARGUMENTS,
  EXIT_CONFIG,
  EXIT_CONFIRM,
  EXIT_CREDENTIALS,
  EXIT_DEPLOY_NOT_FOUND,
  EXIT_DEPLOYMENT,
  EXIT_GIT,
  EXIT_INVALID_MULTI_SELECT,
  EXIT_INVALID_NAME,
  EXIT_LAYER,
  EXIT_LIST,
  EXIT_LOGS,
  EXIT_MANIFEST,
  EXIT_OUTPUT_DIR,
  EXIT_PACKAGE_INSTALL,
  EXIT_PARTIAL,
  EXIT_PROMOTION,
  EXIT_REGISTRATION,
  EXIT_REPO_INITIALISATION,
  EXIT_ROLLBACK,
  EXIT_SCAFFOLD_WRITE,
  EXIT_STATUS,
  EXIT_STORAGE,
  EXIT_SUCCESS,
  EXIT_TARGET_EXISTS,
  EXIT_TEARDOWN,
  EXIT_UNSUPPORTED,
  EXIT_USAGE,
};
