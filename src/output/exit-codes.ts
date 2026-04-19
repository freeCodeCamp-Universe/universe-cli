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

export function exitWithCode(code: number, message?: string): never {
  if (message !== undefined) {
    process.stderr.write(message + "\n");
  }
  process.exit(code);
}
