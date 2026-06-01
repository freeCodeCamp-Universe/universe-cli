#!/usr/bin/env node
import { run } from "./cli.js";
import { installFatalHandlers } from "./lib/fatal.js";
import { REFRESH_FLAG, runRefreshWorker } from "./lib/update-notifier.js";

if (process.argv.includes(REFRESH_FLAG)) {
  void runRefreshWorker();
} else {
  installFatalHandlers();
  void run();
}
