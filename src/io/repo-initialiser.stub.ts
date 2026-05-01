import type { RepoInitialiser } from "./repo-initialiser.port.js";

class StubRepoInitialiser implements RepoInitialiser {
  async initialise(_projectDirectory: string): Promise<void> {
    // No-op
  }
}

export { StubRepoInitialiser };
