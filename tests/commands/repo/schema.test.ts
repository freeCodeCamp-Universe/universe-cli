import { describe, expect, it } from "vitest";
import {
  createRepoRequestSchema,
  REPO_NAME_RE,
  REPO_OWNER,
  repoRowSchema,
  repoStatusSchema,
  visibilitySchema,
} from "../../../src/commands/repo/schema.js";

describe("REPO_NAME_RE", () => {
  it.each(["a", "learn-python-rpg", "Hello_World.js", "0abc", "a".repeat(100)])(
    "accepts %j",
    (name) => {
      expect(REPO_NAME_RE.test(name)).toBe(true);
    },
  );

  it.each([
    ["", "empty"],
    ["-abc", "leading hyphen"],
    [".abc", "leading dot"],
    ["_abc", "leading underscore"],
    ["abc def", "space"],
    ["abc/def", "slash"],
    ["a".repeat(101), "over 100 chars"],
  ])("rejects %j (%s)", (name) => {
    expect(REPO_NAME_RE.test(name)).toBe(false);
  });
});

describe("visibilitySchema", () => {
  it("accepts public and private", () => {
    expect(visibilitySchema.parse("public")).toBe("public");
    expect(visibilitySchema.parse("private")).toBe("private");
  });
  it("rejects other values", () => {
    expect(visibilitySchema.safeParse("secret").success).toBe(false);
  });
});

describe("repoStatusSchema", () => {
  it("enumerates the five lifecycle states", () => {
    for (const s of ["pending", "approved", "active", "rejected", "failed"]) {
      expect(repoStatusSchema.parse(s)).toBe(s);
    }
    expect(repoStatusSchema.safeParse("done").success).toBe(false);
  });
});

describe("createRepoRequestSchema", () => {
  it("defaults visibility to private when omitted", () => {
    const r = createRepoRequestSchema.parse({ name: "my-repo" });
    expect(r.visibility).toBe("private");
    expect(r.template).toBeUndefined();
    expect(r.description).toBeUndefined();
  });

  it("accepts a template name", () => {
    const r = createRepoRequestSchema.parse({
      name: "my-repo",
      template: "hello-universe",
    });
    expect(r.template).toBe("hello-universe");
  });

  it("rejects an empty-string template (must be omitted when blank)", () => {
    expect(createRepoRequestSchema.safeParse({ name: "my-repo", template: "" }).success).toBe(
      false,
    );
  });

  it("rejects an invalid repo name", () => {
    const r = createRepoRequestSchema.safeParse({ name: "-bad" });
    expect(r.success).toBe(false);
  });

  it("rejects a description over 350 chars", () => {
    const r = createRepoRequestSchema.safeParse({
      name: "my-repo",
      description: "x".repeat(351),
    });
    expect(r.success).toBe(false);
  });

  it("rejects unknown keys (strict)", () => {
    const r = createRepoRequestSchema.safeParse({
      name: "my-repo",
      org: "freeCodeCamp",
    });
    expect(r.success).toBe(false);
  });
});

describe("repoRowSchema", () => {
  it("parses a full active wire row", () => {
    const row = {
      id: "req_abc123",
      name: "learn-python-rpg",
      owner: REPO_OWNER,
      visibility: "private",
      description: "a game",
      template: "hello-universe",
      status: "active",
      url: "https://github.com/freeCodeCamp-Universe/learn-python-rpg",
      requestedBy: "octocat",
      approver: "admin1",
      createdAt: "2026-05-29T12:00:00.000Z",
      updatedAt: "2026-05-29T12:01:00.000Z",
    };
    expect(repoRowSchema.parse(row)).toMatchObject({
      id: "req_abc123",
      status: "active",
      owner: REPO_OWNER,
    });
  });

  it("parses a minimal pending row (optional fields absent)", () => {
    const row = {
      id: "req_x",
      name: "foo",
      owner: REPO_OWNER,
      visibility: "public",
      status: "pending",
      requestedBy: "octocat",
      createdAt: "2026-05-29T12:00:00.000Z",
      updatedAt: "2026-05-29T12:00:00.000Z",
    };
    const parsed = repoRowSchema.parse(row);
    expect(parsed.url).toBeUndefined();
    expect(parsed.approver).toBeUndefined();
  });
});
