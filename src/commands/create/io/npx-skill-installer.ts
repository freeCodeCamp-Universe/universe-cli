import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SkillInstaller } from "./skill-installer.port.js";
import type { RunCommand } from "./git-repo-initialiser.js";
import { ConfigError } from "../../../errors.js";

const execFileAsync = promisify(execFile);

const defaultRun: RunCommand = async (command, args, cwd) => {
  await execFileAsync(command, args, { cwd });
};

class NpxSkillInstaller implements SkillInstaller {
  private readonly run: RunCommand;

  constructor(run: RunCommand = defaultRun) {
    this.run = run;
  }

  async installSkills(
    skills: { repo: string; skill: string }[],
    projectDirectory: string,
  ): Promise<void> {
    const skillsByRepo = new Map<string, string[]>();

    for (const { repo, skill } of skills) {
      const existing = skillsByRepo.get(repo);

      if (existing === undefined) {
        skillsByRepo.set(repo, [skill]);
      } else {
        existing.push(skill);
      }
    }

    try {
      for (const [repo, repoSkills] of skillsByRepo) {
        const args = [
          "skills",
          "add",
          repo,
          ...repoSkills.flatMap((skill) => ["--skill", skill]),
        ];
        await this.run("npx", args, projectDirectory);
      }
    } catch (error) {
      throw new ConfigError((error as Error).message);
    }
  }
}

export { NpxSkillInstaller };
