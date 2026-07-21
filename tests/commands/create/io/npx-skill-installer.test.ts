import { describe, it, expect, vi } from "vitest";
import { ConfigError } from "../../../../src/errors.js";
import { NpxSkillInstaller } from "../../../../src/commands/create/io/npx-skill-installer.js";

describe(NpxSkillInstaller, () => {
  it("merges interleaved repos into one call each, preserving order", async () => {
    const calls: [string, string[], string][] = [];
    const run = vi.fn((command: string, args: string[], cwd: string) => {
      calls.push([command, args, cwd]);
      return Promise.resolve();
    });
    const installer = new NpxSkillInstaller(run);

    await installer.installSkills(
      [
        { repo: "org/a", skill: "a1" },
        { repo: "org/b", skill: "b1" },
        { repo: "org/a", skill: "a2" },
      ],
      "/some/project",
    );

    expect(calls).toStrictEqual([
      [
        "npx",
        ["--yes", "skills", "add", "--yes", "org/a", "--skill", "a1", "--skill", "a2"],
        "/some/project",
      ],
      ["npx", ["--yes", "skills", "add", "--yes", "org/b", "--skill", "b1"], "/some/project"],
    ]);
  });

  it("wraps a rejection from run in ConfigError", async () => {
    const run = vi.fn(() => Promise.reject(new Error("npx exited with code 1")));
    const installer = new NpxSkillInstaller(run);

    await expect(
      installer.installSkills([{ repo: "org/a", skill: "a1" }], "/some/project"),
    ).rejects.toBeInstanceOf(ConfigError);
  });

  it("is a no-op for an empty list", async () => {
    const run = vi.fn(() => Promise.resolve());
    const installer = new NpxSkillInstaller(run);

    await expect(installer.installSkills([], "/some/project")).resolves.toBeUndefined();
    expect(run).not.toHaveBeenCalled();
  });
});
