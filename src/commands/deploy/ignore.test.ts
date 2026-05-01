import { createIgnoreFilter } from "./ignore.js";

describe(createIgnoreFilter, () => {
  describe("extension globs", () => {
    it("matches *.map at any depth", () => {
      const ignore = createIgnoreFilter(["*.map"]);
      expect(ignore("main.js.map")).toBe(true);
      expect(ignore("nested/dir/foo.map")).toBe(true);
    });

    it("does not match unrelated files", () => {
      const ignore = createIgnoreFilter(["*.map"]);
      expect(ignore("main.js")).toBe(false);
      expect(ignore("nested/dir/a.html")).toBe(false);
    });
  });

  describe("prefix globs", () => {
    it(".env* matches .env, .env.local at any depth", () => {
      const ignore = createIgnoreFilter([".env*"]);
      expect(ignore(".env")).toBe(true);
      expect(ignore(".env.local")).toBe(true);
      expect(ignore("nested/.env.production")).toBe(true);
    });

    it(".env* does not match plain env or env.txt", () => {
      const ignore = createIgnoreFilter([".env*"]);
      expect(ignore("env")).toBe(false);
      expect(ignore("env.txt")).toBe(false);
    });
  });

  describe("directory recursion (dir/**)", () => {
    it("node_modules/** matches every file under node_modules", () => {
      const ignore = createIgnoreFilter(["node_modules/**"]);
      expect(ignore("node_modules/foo.js")).toBe(true);
      expect(ignore("node_modules/lodash/index.js")).toBe(true);
      expect(ignore("node_modules/@scope/pkg/dist/index.mjs")).toBe(true);
    });

    it(".git/** matches files under .git", () => {
      const ignore = createIgnoreFilter([".git/**"]);
      expect(ignore(".git/HEAD")).toBe(true);
      expect(ignore(".git/refs/heads/main")).toBe(true);
    });

    it("does not match directories not named exactly", () => {
      const ignore = createIgnoreFilter(["node_modules/**"]);
      expect(ignore("notnode_modules/foo.js")).toBe(false);
      expect(ignore("src/node_modules_file.js")).toBe(false);
    });
  });

  describe("multiple patterns", () => {
    it("ignores when any pattern matches", () => {
      const ignore = createIgnoreFilter(["*.map", "node_modules/**", ".git/**", ".env*"]);
      expect(ignore("dist/main.js")).toBe(false);
      expect(ignore("dist/main.js.map")).toBe(true);
      expect(ignore("node_modules/lodash/index.js")).toBe(true);
      expect(ignore(".git/HEAD")).toBe(true);
      expect(ignore(".env.local")).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("empty pattern list ignores nothing", () => {
      const ignore = createIgnoreFilter([]);
      expect(ignore("anything.js")).toBe(false);
    });

    it("normalizes leading ./ in input path", () => {
      const ignore = createIgnoreFilter(["*.map"]);
      expect(ignore("./foo.map")).toBe(true);
    });

    it("ignores case-sensitively (Unix semantics)", () => {
      const ignore = createIgnoreFilter(["*.MAP"]);
      expect(ignore("foo.MAP")).toBe(true);
      expect(ignore("foo.map")).toBe(false);
    });

    it("treats backslash paths as forward-slash for matching", () => {
      const ignore = createIgnoreFilter(["node_modules/**"]);
      expect(ignore("node_modules\\foo.js")).toBe(true);
    });

    it("literal path pattern matches exactly", () => {
      const ignore = createIgnoreFilter(["src/secret.txt"]);
      expect(ignore("src/secret.txt")).toBe(true);
      expect(ignore("src/secret.txt.bak")).toBe(false);
      expect(ignore("nested/src/secret.txt")).toBe(false);
    });

    it("? matches single character (non-slash)", () => {
      const ignore = createIgnoreFilter(["fil?.txt"]);
      expect(ignore("file.txt")).toBe(true);
      expect(ignore("filx.txt")).toBe(true);
      expect(ignore("fi/e.txt")).toBe(false);
    });
  });
});
