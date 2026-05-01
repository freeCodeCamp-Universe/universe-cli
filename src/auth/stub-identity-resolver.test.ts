import { StubIdentityResolver } from "./stub-identity-resolver.js";

describe(StubIdentityResolver, () => {
  it("resolve() returns the configured identity", async () => {
    const resolver = new StubIdentityResolver({ source: "env_GH_TOKEN", token: "ghp_x" });
    await expect(resolver.resolve()).resolves.toStrictEqual({
      source: "env_GH_TOKEN",
      token: "ghp_x",
    });
  });

  it("resolve() returns null when constructed with null", async () => {
    const resolver = new StubIdentityResolver(null);
    await expect(resolver.resolve()).resolves.toBeNull();
  });

  it("resolve() defaults to a fixed token with env_GITHUB_TOKEN source", async () => {
    const resolver = new StubIdentityResolver();
    const r = await resolver.resolve();
    expect(r?.source).toBe("env_GITHUB_TOKEN");
    expect(r?.token).toBeDefined();
  });
});
