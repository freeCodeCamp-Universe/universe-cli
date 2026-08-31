export const EXIT_SUCCESS = 0;
export const EXIT_USAGE = 10;
export const EXIT_CONFIG = 11;
export const EXIT_CREDENTIALS = 12;
export const EXIT_STORAGE = 13;
export const EXIT_OUTPUT_DIR = 14;
export const EXIT_GIT = 15;
export const EXIT_ALIAS = 16;
export const EXIT_DEPLOY_NOT_FOUND = 17;
export const EXIT_CONFIRM = 18;
export const EXIT_PARTIAL = 19;

/**
 * Terminate the process with the given exit code.
 *
 * Callers are responsible for surfacing any user-facing message BEFORE
 * invoking this — via `outputError`, clack's `log.error`, or `emitJson`
 * for `--json` consumers. The previous signature accepted a `message`
 * arg and wrote it to stderr unconditionally, which caused every error
 * path to print twice (pretty render + raw stderr dump). The pretty
 * render is the source of truth; exit just exits.
 */
export function exitWithCode(code: number): never {
  process.exit(code);
}
