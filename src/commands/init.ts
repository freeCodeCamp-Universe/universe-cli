import { execSync } from "node:child_process";
import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { confirm, isCancel, log, text } from "@clack/prompts";
import { stringify as stringifyYaml } from "yaml";
import { CliError, ConfigError, ConfirmError } from "../errors.js";
import { parsePlatformYaml } from "../lib/platform-yaml.js";
import { SITE_NAME_PATTERN } from "../lib/platform-yaml.schema.js";
import { buildEnvelope } from "../output/envelope.js";
import { EXIT_USAGE, exitWithCode } from "../output/exit-codes.js";
import { emitJson, outputError } from "../output/format.js";

export interface InitOptions {
  json: boolean;
  site?: string;
  dir?: string;
  force?: boolean;
  yes?: boolean;
}

export interface PromptTextOptions {
  message: string;
  defaultValue: string;
  validate?: (value: string) => string | undefined;
}

export interface InitDeps {
  cwd?: string;
  readFileText?: (path: string) => Promise<string>;
  writeFileText?: (path: string, data: string) => Promise<void>;
  pathExists?: (path: string) => Promise<boolean>;
  detectGitRemote?: (cwd: string) => string | null;
  isTTY?: boolean;
  promptText?: (opts: PromptTextOptions) => Promise<string>;
  promptConfirm?: (message: string, initial: boolean) => Promise<boolean>;
  logSuccess?: (msg: string) => void;
  logInfo?: (msg: string) => void;
  logError?: (msg: string) => void;
  exit?: (code: number) => never;
}

interface BuildBlock {
  command?: string;
  output: string;
}

const DEFAULT_OUTPUT = "dist";

const defaultReadFileText = (path: string): Promise<string> =>
  readFile(path, "utf-8");

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

const defaultPromptText = async (opts: PromptTextOptions): Promise<string> => {
  const validate = opts.validate;
  const r = await text({
    message: opts.message,
    placeholder: opts.defaultValue,
    defaultValue: opts.defaultValue,
    ...(validate
      ? { validate: (v: string | undefined) => validate(v ?? "") }
      : {}),
  });
  if (isCancel(r)) throw new ConfirmError("init cancelled");
  return r.trim().length > 0 ? r.trim() : opts.defaultValue;
};

const defaultPromptConfirm = async (
  message: string,
  initial: boolean,
): Promise<boolean> => {
  const r = await confirm({ message, initialValue: initial });
  if (isCancel(r)) throw new ConfirmError("init cancelled");
  return r === true;
};

export function sanitizeSite(raw: string): string {
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/g, "");
  return SITE_NAME_PATTERN.test(slug) ? slug : "";
}

export function repoNameFromRemote(url: string): string {
  const noSuffix = url.trim().replace(/\.git$/, "");
  const segments = noSuffix.split(/[/:]/).filter((s) => s.length > 0);
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

function siteValidator(value: string): string | undefined {
  const v = value.trim();
  if (v.length === 0) return "site is required";
  if (v.length > 63) return "site must be at most 63 characters";
  if (!SITE_NAME_PATTERN.test(v)) {
    return "lowercase letters, digits, single hyphens; no leading/trailing/consecutive hyphens";
  }
  return undefined;
}

function nonEmptyValidator(value: string): string | undefined {
  return value.trim().length === 0 ? "required" : undefined;
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

export async function init(
  options: InitOptions,
  deps: InitDeps = {},
): Promise<void> {
  const cwd = deps.cwd ?? process.cwd();
  const readFileText = deps.readFileText ?? defaultReadFileText;
  const writeFileText = deps.writeFileText ?? defaultWriteFileText;
  const pathExists = deps.pathExists ?? defaultPathExists;
  const detectGitRemote = deps.detectGitRemote ?? defaultDetectGitRemote;
  const isTTY = deps.isTTY ?? Boolean(process.stdin.isTTY);
  const promptText = deps.promptText ?? defaultPromptText;
  const promptConfirm = deps.promptConfirm ?? defaultPromptConfirm;
  const success = deps.logSuccess ?? ((s: string) => log.success(s));
  const info = deps.logInfo ?? ((s: string) => log.info(s));
  const error = deps.logError ?? ((s: string) => log.error(s));
  const exit = deps.exit ?? exitWithCode;

  const interactive = isTTY && !options.yes && !options.json;

  try {
    const target = resolve(cwd, "platform.yaml");
    if ((await pathExists(target)) && !options.force) {
      throw new ConfigError(
        `platform.yaml already exists in ${cwd}. Pass --force to overwrite.`,
      );
    }

    const derivedSite = deriveSite(cwd, detectGitRemote(cwd));
    const detectedCommand = await detectBuildCommand(
      cwd,
      readFileText,
      pathExists,
    );

    let site = options.site?.trim() || derivedSite;
    let build: BuildBlock | null = null;

    if (interactive) {
      site = await promptText({
        message: "Site slug (becomes <slug>.freecode.camp)",
        defaultValue: derivedSite,
        validate: siteValidator,
      });

      const wantBuild = await promptConfirm(
        "Does this project run a build command before deploy?",
        detectedCommand !== null,
      );

      if (wantBuild) {
        const command = await promptText({
          message: "Build command",
          defaultValue: detectedCommand ?? "npm run build",
          validate: nonEmptyValidator,
        });
        const output = await promptText({
          message: "Build output directory (uploaded to the proxy)",
          defaultValue: options.dir?.trim() || DEFAULT_OUTPUT,
          validate: nonEmptyValidator,
        });
        build = { command, output };
      } else {
        const output = await promptText({
          message: "Directory with pre-built files to deploy",
          defaultValue: options.dir?.trim() || DEFAULT_OUTPUT,
          validate: nonEmptyValidator,
        });
        if (output !== DEFAULT_OUTPUT) build = { output };
      }
    } else {
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
      throw new ConfigError(
        `generated platform.yaml failed validation: ${parsed.error}`,
      );
    }

    await writeFileText(target, content);

    if (options.json) {
      emitJson(
        buildEnvelope("init", true, {
          path: target,
          site,
          build: build
            ? { command: build.command ?? null, output: build.output }
            : null,
        }),
      );
      return;
    }

    if (!interactive) {
      info(`Wrote platform.yaml for site '${site}'.`);
    }
    const lines = [
      `Created platform.yaml`,
      ``,
      `  Path:     ${target}`,
      `  Site:     ${site}`,
    ];
    if (build?.command) lines.push(`  Build:    ${build.command}`);
    lines.push(`  Output:   ${build?.output ?? DEFAULT_OUTPUT}`);
    lines.push(``, `Next: universe static deploy`);
    success(lines.join("\n"));
  } catch (err) {
    const code = err instanceof CliError ? err.exitCode : EXIT_USAGE;
    const message = err instanceof Error ? err.message : String(err);
    outputError({ json: options.json, command: "init" }, code, message, {
      logError: error,
    });
    exit(code);
  }
}
