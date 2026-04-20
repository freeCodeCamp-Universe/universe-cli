import { describe, it, expect } from "vitest";
import { WoodpeckerError } from "../../src/woodpecker/errors.js";

describe("WoodpeckerError", () => {
  it("carries message only when status and body are absent", () => {
    const err = new WoodpeckerError("boom");
    expect(err.message).toBe("boom");
    expect(err.status).toBeUndefined();
    expect(err.body).toBeUndefined();
    expect(err.name).toBe("WoodpeckerError");
    expect(err).toBeInstanceOf(Error);
  });

  it("carries status and body when provided", () => {
    const err = new WoodpeckerError("bad", 500, "server fire");
    expect(err.status).toBe(500);
    expect(err.body).toBe("server fire");
  });
});
