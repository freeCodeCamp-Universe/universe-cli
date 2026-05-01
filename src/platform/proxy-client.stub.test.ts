import { StubProxyClient } from "./proxy-client.stub.js";

describe(StubProxyClient, () => {
  describe("default responses", () => {
    it("whoami returns a default WhoAmIResponse", async () => {
      const client = new StubProxyClient();
      const r = await client.whoami();
      expect(r.login).toBeDefined();
      expect(Array.isArray(r.authorizedSites)).toBe(true);
    });

    it("deployInit returns a default DeployInitResponse", async () => {
      const client = new StubProxyClient();
      const r = await client.deployInit({ sha: "h", site: "s" });
      expect(r.deployId).toBeDefined();
      expect(r.jwt).toBeDefined();
      expect(r.expiresAt).toBeDefined();
    });

    it("deployUpload returns a default DeployUploadResponse", async () => {
      const client = new StubProxyClient();
      const r = await client.deployUpload({
        body: new Uint8Array(),
        deployId: "d",
        jwt: "j",
        path: "index.html",
      });
      expect(r.received).toBeDefined();
      expect(r.key).toBeDefined();
    });

    it("deployFinalize returns a default DeployFinalizeResponse", async () => {
      const client = new StubProxyClient();
      const r = await client.deployFinalize({
        deployId: "d",
        files: [],
        jwt: "j",
        mode: "preview",
      });
      expect(r.url).toBeDefined();
      expect(r.deployId).toBeDefined();
      expect(r.mode).toBeDefined();
    });

    it("siteDeploys returns an empty array by default", async () => {
      const client = new StubProxyClient();
      const r = await client.siteDeploys({ site: "s" });
      expect(Array.isArray(r)).toBe(true);
    });

    it("sitePromote returns a default AliasResponse", async () => {
      const client = new StubProxyClient();
      const r = await client.sitePromote({ site: "s" });
      expect(r.url).toBeDefined();
      expect(r.deployId).toBeDefined();
    });

    it("siteRollback returns a default AliasResponse", async () => {
      const client = new StubProxyClient();
      const r = await client.siteRollback({ site: "s", to: "old" });
      expect(r.url).toBeDefined();
      expect(r.deployId).toBeDefined();
    });
  });

  describe("overrides", () => {
    it("whoami can be overridden", async () => {
      const client = new StubProxyClient({
        whoami: () => Promise.resolve({ authorizedSites: ["my-site"], login: "alice" }),
      });
      const r = await client.whoami();
      expect(r.login).toBe("alice");
      expect(r.authorizedSites).toStrictEqual(["my-site"]);
    });

    it("deployInit can be overridden", async () => {
      const client = new StubProxyClient({
        deployInit: () =>
          Promise.resolve({ deployId: "custom-id", expiresAt: "2099-01-01Z", jwt: "custom-jwt" }),
      });
      const r = await client.deployInit({ sha: "h", site: "s" });
      expect(r.deployId).toBe("custom-id");
    });

    it("siteDeploys can be overridden to return items", async () => {
      const client = new StubProxyClient({
        siteDeploys: () => Promise.resolve([{ deployId: "abc" }, { deployId: "def" }]),
      });
      const r = await client.siteDeploys({ site: "s" });
      expect(r).toHaveLength(2);
      expect(r[0]?.deployId).toBe("abc");
    });

    it("non-overridden methods still return defaults when others are overridden", async () => {
      const client = new StubProxyClient({
        whoami: () => Promise.resolve({ authorizedSites: [], login: "bob" }),
      });
      const r = await client.sitePromote({ site: "s" });
      expect(r.deployId).toBeDefined();
    });
  });
});
