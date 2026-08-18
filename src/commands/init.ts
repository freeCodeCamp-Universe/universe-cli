import { execSync } from "node:child_process";
import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { log } from "@clack/prompts";
import { stringify as stringifyYaml } from "yaml";
import { ConfigError } from "../errors.js";
import { clackDriver } from "../interaction/clack-driver.js";
import { silentDrive } from "../interaction/silent-driver.js";
import type { Step, StepResponse } from "../interaction/step.js";
import { parsePlatformYaml } from "../lib/platform-yaml.js";
import { SITE_NAME_PATTERN } from "../lib/platform-yaml.schema.js";
import type { CommandResult } from "../output/command-result.js";
import { buildEnvelope } from "../output/envelope.js";
import { exitWithCode } from "../output/exit-codes.js";
import { emitJson, outputError } from "../output/format.js";

interface InitOptions {
  site?: string;
  dir?: string;
  force?: boolean;
  yes?: boolean;
}

interface InitSdkDeps {
  cwd?: string;
  readFileText?: (path: string) => Promise<string>;
  writeFileText?: (path: string, data: string) => Promise<void>;
  pathExists?: (path: string) => Promise<boolean>;
  detectGitRemote?: (cwd: string) => string | null;
}

interface InitHandlerOptions {
  json: boolean;
  site?: string;
  dir?: string;
  force?: boolean;
  yes?: boolean;
}

interface InitHandlerDeps extends InitSdkDeps {
  isTTY?: boolean;
  logSuccess?: (msg: string) => void;
  logInfo?: (msg: string) => void;
  logError?: (msg: string) => void;
  exit?: (code: number) => void;
}

interface BuildBlock {
  command?: string;
  output: string;
}

const DEFAULT_OUTPUT = "dist";

const defaultReadFileText = (path: string): Promise<string> => readFile(path, "utf-8");

const defaultWriteFileText = (path: string, data: string): Promise<void> =>
  writeFile(path, data, { encoding: "utf-8", flag: "w" });

const defaultPathExists = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

const defaultDetectGitRemote = (cwd: string): string | null => {
  try {
    return execSync("git remote get-url origin", {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
};

function sanitizeSite(raw: string): string {
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 63)
    .replace(/-+$/gu, "");
  return SITE_NAME_PATTERN.test(slug) ? slug : "";
}

function repoNameFromRemote(url: string): string {
  const noSuffix = url.trim().replace(/\.git$/u, "");
  const segments = noSuffix.split(/[/:]/u).filter((s) => s.length > 0);
  return segments[segments.length - 1] ?? "";
}

function deriveSite(cwd: string, remote: string | null): string {
  const fromRemote = remote ? sanitizeSite(repoNameFromRemote(remote)) : "";
  if (fromRemote) return fromRemote;
  const fromDir = sanitizeSite(basename(cwd));
  return fromDir || "site";
}

const LOCKFILE_MANAGERS: ReadonlyArray<readonly [string, string]> = [
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["bun.lockb", "bun"],
  ["bun.lock", "bun"],
  ["package-lock.json", "npm"],
];

async function detectPackageManager(
  cwd: string,
  pathExists: (path: string) => Promise<boolean>,
): Promise<string> {
  for (const [lockfile, manager] of LOCKFILE_MANAGERS) {
    if (await pathExists(resolve(cwd, lockfile))) return manager;
  }
  return "npm";
}

async function detectBuildCommand(
  cwd: string,
  readFileText: (path: string) => Promise<string>,
  pathExists: (path: string) => Promise<boolean>,
): Promise<string | null> {
  let raw: string;
  try {
    raw = await readFileText(resolve(cwd, "package.json"));
  } catch {
    return null;
  }
  let pkg: { scripts?: Record<string, unknown> };
  try {
    pkg = JSON.parse(raw) as typeof pkg;
  } catch {
    return null;
  }
  if (typeof pkg.scripts?.["build"] !== "string") return null;
  const manager = await detectPackageManager(cwd, pathExists);
  return `${manager} run build`;
}

function siteValidator(value: string | undefined): string | undefined {
  const v = value?.trim();
  if (!v) return "site is required";
  if (v.length > 63) return "site must be at most 63 characters";
  if (!SITE_NAME_PATTERN.test(v)) {
    return "lowercase letters, digits, single hyphens; no leading/trailing/consecutive hyphens";
  }
  return undefined;
}

function nonEmptyValidator(value: string | undefined): string | undefined {
  return !value || value.trim().length === 0 ? "required" : undefined;
}

function renderYaml(site: string, build: BuildBlock | null): string {
  const header =
    "# platform.yaml — freeCodeCamp Universe deploy config\n" +
    "# Schema: docs/platform-yaml.md\n\n";
  const doc: Record<string, unknown> = { site };
  if (build) {
    doc.build = build.command
      ? { command: build.command, output: build.output }
      : { output: build.output };
  }
  return header + stringifyYaml(doc);
}

/** Generate a `platform.yaml` config file. Yields text/confirm steps for interactive input. */
async function* init(
  options: InitOptions,
  deps: InitSdkDeps = {},
): AsyncGenerator<Step, CommandResult, StepResponse> {
  const cwd = deps.cwd ?? process.cwd();
  const readFileText = deps.readFileText ?? defaultReadFileText;
  const writeFileText = deps.writeFileText ?? defaultWriteFileText;
  const pathExists = deps.pathExists ?? defaultPathExists;
  const detectGitRemote = deps.detectGitRemote ?? defaultDetectGitRemote;

  const target = resolve(cwd, "platform.yaml");
  if ((await pathExists(target)) && !options.force) {
    throw new ConfigError(`platform.yaml already exists in ${cwd}. Pass --force to overwrite.`);
  }

  const derivedSite = deriveSite(cwd, detectGitRemote(cwd));
  const detectedCommand = await detectBuildCommand(cwd, readFileText, pathExists);

  let site: string;
  let build: BuildBlock | null = null;

  if (!options.yes && !options.site) {
    site = ((yield {
      type: "text",
      field: "site",
      message: "Site slug (becomes <slug>.freecode.camp)",
      placeholder: derivedSite,
      defaultValue: derivedSite,
      validate: siteValidator,
    }) as string) || derivedSite;

    const wantBuild = (yield {
      type: "confirm",
      field: "want-build",
      message: "Does this project run a build command before deploy?",
      initialValue: detectedCommand !== null,
    }) as boolean;

    if (wantBuild) {
      const command = ((yield {
        type: "text",
        field: "build-command",
        message: "Build command",
        defaultValue: detectedCommand ?? "npm run build",
        validate: nonEmptyValidator,
      }) as string) || (detectedCommand ?? "npm run build");

      const output = ((yield {
        type: "text",
        field: "build-output",
        message: "Build output directory (uploaded to the proxy)",
        defaultValue: options.dir?.trim() || DEFAULT_OUTPUT,
        validate: nonEmptyValidator,
      }) as string) || (options.dir?.trim() || DEFAULT_OUTPUT);

      build = { command, output };
    } else {
      const output = ((yield {
        type: "text",
        field: "output-dir",
        message: "Directory with pre-built files to deploy",
        defaultValue: options.dir?.trim() || DEFAULT_OUTPUT,
        validate: nonEmptyValidator,
      }) as string) || (options.dir?.trim() || DEFAULT_OUTPUT);

      if (output !== DEFAULT_OUTPUT) build = { output };
    }
  } else {
    site = options.site?.trim() || derivedSite;
    const output = options.dir?.trim() || DEFAULT_OUTPUT;
    if (detectedCommand) {
      build = { command: detectedCommand, output };
    } else if (output !== DEFAULT_OUTPUT) {
      build = { output };
    }
  }

  const content = renderYaml(site, build);

  const parsed = parsePlatformYaml(content);
  if (!parsed.ok) {
    throw new ConfigError(`generated platform.yaml failed validation: ${parsed.error}`);
  }

  await writeFileText(target, content);

  const lines = [`Created platform.yaml`, ``, `  Path:     ${target}`, `  Site:     ${site}`];
  if (build?.command) lines.push(`  Build:    ${build.command}`);
  lines.push(`  Output:   ${build?.output ?? DEFAULT_OUTPUT}`);
  lines.push(``, `Next: universe static deploy`);

  return {
    data: buildEnvelope("init", true, {
      path: target,
      site,
      build: build ? { command: build.command ?? null, output: build.output } : null,
    }),
    format: lines.join("\n"),
  };
}



async function initHandler(
  options: InitHandlerOptions,
  deps: InitHandlerDeps = {},
): Promise<void> {
  const success = deps.logSuccess ?? ((s: string) => log.success(s));
  const info = deps.logInfo ?? ((s: string) => log.info(s));
  const error = deps.logError ?? ((s: string) => log.error(s));
  const exit = deps.exit ?? exitWithCode;
  const isTTY = deps.isTTY ?? Boolean(process.stdin.isTTY);
  const interactive = isTTY && !options.yes && !options.json;

  const sdkOpts: InitOptions = {
    site: options.site,
    dir: options.dir,
    force: options.force,
    yes: !interactive,
  };

  let result: CommandResult;
  try {
    if (interactive) {
      result = await clackDriver(init(sdkOpts, deps));
    } else {
      result = await silentDrive(init(sdkOpts, deps));
    }
  } catch (err) {
    exit(outputError({ json: options.json, command: "init" }, err, { logError: error }));
    return;
  }

  if (options.json) {
    emitJson(result.data);
  } else {
    if (!interactive) {
      info(`Wrote platform.yaml for site '${result.data.site}'.`);
    }
    success(result.format);
  }
}

export { init, initHandler, sanitizeSite, repoNameFromRemote };
export type { InitOptions, InitSdkDeps, InitHandlerOptions, InitHandlerDeps };
