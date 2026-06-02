#!/usr/bin/env node
import { run } from "./cli.js";
import { installFatalHandlers } from "./lib/fatal.js";
import { REFRESH_ENV, runRefreshWorker } from "./lib/update-notifier.js";

if (process.env[REFRESH_ENV] === "1") {
  void runRefreshWorker();
} else {
  installFatalHandlers();
  void run();
}
