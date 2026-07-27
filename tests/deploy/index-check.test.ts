import { describe, expect, it } from "vitest";
import {
  hasRootIndex,
  looksLikeFrameworkBuild,
  missingRootIndexMessage,
} from "../../src/deploy/index-check.js";

describe("hasRootIndex", () => {
  it("is true when a bare index.html is present", () => {
    expect(hasRootIndex(["index.html", "assets/app.js"])).toBe(true);
  });
  it("is false for a nested-only index.html", () => {
    expect(hasRootIndex(["assets/index.html", "app.js"])).toBe(false);
  });
  it("is false for ./, /, and case variants", () => {
    expect(hasRootIndex(["./index.html"])).toBe(false);
    expect(hasRootIndex(["/index.html"])).toBe(false);
    expect(hasRootIndex(["INDEX.HTML"])).toBe(false);
  });
  it("is false when absent", () => {
    expect(hasRootIndex(["app.js"])).toBe(false);
  });
});

describe("looksLikeFrameworkBuild", () => {
  it("detects a Next bare-root build (the incident)", () => {
    expect(
      looksLikeFrameworkBuild([
        "BUILD_ID",
        "build-manifest.json",
        "server/app.js",
      ]),
    ).toBe(true);
  });
  it("detects a Next prefixed build", () => {
    expect(looksLikeFrameworkBuild([".next/BUILD_ID", "index.html"])).toBe(
      true,
    );
  });
  it("detects nitro, sveltekit, nuxt, and output shapes", () => {
    expect(looksLikeFrameworkBuild(["nitro.json"])).toBe(true);
    expect(looksLikeFrameworkBuild(["_app/immutable/x.js"])).toBe(true);
    expect(looksLikeFrameworkBuild([".output/server/index.mjs"])).toBe(true);
    expect(looksLikeFrameworkBuild([".nuxt/dist/x.js"])).toBe(true);
  });
  it("normalizes Windows backslashes", () => {
    expect(
      looksLikeFrameworkBuild([
        ".next\\BUILD_ID",
        ".next\\build-manifest.json",
      ]),
    ).toBe(true);
  });
  it("does not fire on a single Next marker", () => {
    expect(looksLikeFrameworkBuild(["BUILD_ID"])).toBe(false);
  });
  it("does not fire on a plain static site", () => {
    expect(looksLikeFrameworkBuild(["index.html", "app.js", "style.css"])).toBe(
      false,
    );
  });
});

describe("missingRootIndexMessage", () => {
  it("carries the static-export hint for a framework build", () => {
    const msg = missingRootIndexMessage(
      ["BUILD_ID", "build-manifest.json"],
      "/proj/.next",
    );
    expect(msg).toContain("static export");
    expect(msg).toContain("/proj/.next");
  });
  it("omits the hint for a plain static output", () => {
    const msg = missingRootIndexMessage(["styles.css"], "/proj/dist");
    expect(msg).not.toContain("static export");
  });
});
