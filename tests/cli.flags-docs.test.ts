import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const reference = readFileSync(join(repoRoot, "docs", "reference.md"), "utf-8");
const cli = readFileSync(join(repoRoot, "src", "cli.ts"), "utf-8");

function documentedFlags(command: string): string[] {
  const row = reference.split("\n").find((line) => line.startsWith(`| \`${command}\``));
  expect(row, `no reference.md row for ${command}`).toBeDefined();
  const flags = row!.split("|")[2] ?? "";
  return [...flags.matchAll(/`(--[a-z-]+)/g)].map((m) => m[1] as string);
}

function cliFlags(command: string): string[] {
  const start = cli.indexOf(`.command("${command}")`);
  expect(start, `no cli.ts command for ${command}`).toBeGreaterThan(-1);
  const next = cli.indexOf(".command(", start + 1);
  const block = cli.slice(start, next === -1 ? undefined : next);
  return [...block.matchAll(/\.option\(\s*"(--[a-z-]+)/g)].map((m) => m[1] as string);
}

describe("docs/reference.md command table", () => {
  for (const [documented, implemented] of [
    ["universe static deploy", "deploy"],
    ["universe static promote", "promote"],
    ["universe static rollback", "rollback"],
  ] as const) {
    it(`lists every ${implemented} flag the CLI defines`, () => {
      const declared = cliFlags(implemented);
      const listed = documentedFlags(documented);
      const missing = declared.filter((flag) => !listed.includes(flag));
      expect(missing, `undocumented in reference.md: ${missing.join(", ")}`).toHaveLength(0);
    });
  }
});
