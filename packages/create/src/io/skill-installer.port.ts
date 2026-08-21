interface SkillInstaller {
  installSkills(skills: { repo: string; skill: string }[], projectDirectory: string): Promise<void>;
}

export type { SkillInstaller };
