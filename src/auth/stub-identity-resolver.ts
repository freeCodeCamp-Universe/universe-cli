import type { IdentityResolver, ResolvedIdentity } from "./identity-resolver.port.js";

const DEFAULT_IDENTITY: ResolvedIdentity = {
  source: "env_GITHUB_TOKEN",
  token: "stub-token",
};

class StubIdentityResolver implements IdentityResolver {
  private readonly identity: ResolvedIdentity | null;

  constructor(identity: ResolvedIdentity | null = DEFAULT_IDENTITY) {
    this.identity = identity;
  }

  resolve(): Promise<ResolvedIdentity | null> {
    return Promise.resolve(this.identity);
  }
}

export { StubIdentityResolver };
