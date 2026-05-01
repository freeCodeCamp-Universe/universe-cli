interface RepoInitialiser {
  initialise(projectDirectory: string): Promise<void>;
}

export type { RepoInitialiser };
