import { StubTokenStore } from "./stub-token-store.js";

describe(StubTokenStore, () => {
  let store: StubTokenStore;

  beforeEach(() => {
    store = new StubTokenStore();
  });

  it("saveToken then loadToken returns the saved value", async () => {
    await store.saveToken("ghp_test");
    await expect(store.loadToken()).resolves.toBe("ghp_test");
  });

  it("deleteToken then loadToken returns null", async () => {
    await store.saveToken("ghp_test");
    await store.deleteToken();
    await expect(store.loadToken()).resolves.toBeNull();
  });

  it("loadToken returns null when nothing saved", async () => {
    await expect(store.loadToken()).resolves.toBeNull();
  });

  it("saving an empty string throws", async () => {
    await expect(store.saveToken("")).rejects.toThrow(/empty/i);
  });

  it("saving a whitespace-only string throws", async () => {
    await expect(store.saveToken("   ")).rejects.toThrow(/empty/i);
  });
});
