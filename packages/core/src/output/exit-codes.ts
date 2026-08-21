const EXIT_SUCCESS = 0;
const EXIT_CONFIG = 11;
const EXIT_CONFIRM = 18;
const EXIT_CREDENTIALS = 12;
const EXIT_STORAGE = 13;
const EXIT_OUTPUT_DIR = 14;
const EXIT_GIT = 15;
const EXIT_ALIAS = 16;
const EXIT_DEPLOY_NOT_FOUND = 17;
const EXIT_PARTIAL = 19;
const EXIT_USAGE = 10;

function exitWithCode(code: number): never {
  process.exit(code);
}

export {
  EXIT_ALIAS,
  EXIT_CONFIG,
  EXIT_CONFIRM,
  EXIT_CREDENTIALS,
  EXIT_DEPLOY_NOT_FOUND,
  EXIT_GIT,
  EXIT_OUTPUT_DIR,
  EXIT_PARTIAL,
  EXIT_STORAGE,
  EXIT_SUCCESS,
  EXIT_USAGE,
  exitWithCode,
};
