#!/usr/bin/env node

import { spawn } from "node:child_process";

spawn(
  process.execPath,
  [new URL("../dist/index.cjs", import.meta.url).pathname, "create", ...process.argv.slice(2)],
  { stdio: "inherit" },
);
