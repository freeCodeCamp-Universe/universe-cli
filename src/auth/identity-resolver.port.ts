type IdentitySource = "env_GITHUB_TOKEN" | "env_GH_TOKEN" | "gh_cli" | "device_flow";

interface ResolvedIdentity {
  token: string;
  source: IdentitySource;
}

interface IdentityResolver {
  resolve(): Promise<ResolvedIdentity | null>;
}

export type { IdentityResolver, IdentitySource, ResolvedIdentity };
