import { describe, it, expect } from "vitest";
import { redact, redactObject } from "../../src/output/redact.js";

describe("redact", () => {
  it("masks AWS access key IDs (AKIA prefix)", () => {
    const result = redact("key is AKIAIOSFODNN7EXAMPLE");
    expect(result).toBe("key is AKIA****MPLE");
    expect(result).not.toContain("IOSFODNN7EXA");
  });

  it("masks AKIA keys that are exactly 20 chars", () => {
    const result = redact("AKIAIOSFODNN7EXAMPL1");
    expect(result).toBe("AKIA****MPL1");
  });

  it("masks long hex strings (>20 chars) in credential context", () => {
    const result = redact("secret=abcdef0123456789abcdef0123456789");
    expect(result).toContain("****");
    expect(result).not.toContain("abcdef0123456789abcdef0123456789");
  });

  it("masks long base64 strings (>20 chars) in credential context", () => {
    const result = redact("secret=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY");
    expect(result).toContain("****");
    expect(result).not.toContain("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY");
  });

  it("masks embedded credentials in S3 endpoint URLs", () => {
    const result = redact(
      "https://AKIAIOSFODNN7EXAMPLE:secretkey@s3.amazonaws.com/bucket",
    );
    expect(result).toContain("s3.amazonaws.com");
    expect(result).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(result).not.toContain("secretkey");
  });

  it("returns non-credential strings unchanged", () => {
    const plain = "just a normal message with no secrets";
    expect(redact(plain)).toBe(plain);
  });

  it("masks long hex strings (32+ chars) in credential context", () => {
    const hexKey = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
    const result = redact(`access_key_id=${hexKey}`);
    expect(result).toContain("****");
    expect(result).not.toContain(hexKey);
  });

  it("handles empty string", () => {
    expect(redact("")).toBe("");
  });
});

describe("redactObject", () => {
  it("deep-redacts string values that look like credentials", () => {
    const obj = {
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      bucket: "my-bucket",
      nested: {
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      },
    };
    const result = redactObject(obj);
    expect(result.accessKeyId).toContain("****");
    expect(result.bucket).toBe("my-bucket");
    const nested = result.nested as Record<string, unknown>;
    expect(nested.secretAccessKey).toContain("****");
  });

  it("preserves non-string values", () => {
    const obj = { count: 42, flag: true, name: "safe-string" };
    const result = redactObject(obj);
    expect(result).toEqual({ count: 42, flag: true, name: "safe-string" });
  });

  it("handles arrays inside objects", () => {
    const obj = {
      keys: ["AKIAIOSFODNN7EXAMPLE", "normal-value"],
    };
    const result = redactObject(obj);
    const keys = result.keys as string[];
    expect(keys[0]).toContain("****");
    expect(keys[1]).toBe("normal-value");
  });

  it("masks values for credential key names regardless of format", () => {
    const obj = {
      accessKeyId: "shortval",
      secretAccessKey: "anyvalue",
      access_key_id: "cf-key-12345",
      secret_access_key: "cf-secret-67890",
    };
    const result = redactObject(obj);
    expect(result.accessKeyId).toBe("****");
    expect(result.secretAccessKey).toBe("****");
    expect(result.access_key_id).toBe("****");
    expect(result.secret_access_key).toBe("****");
  });

  it("does not mutate the original object", () => {
    const obj = { key: "AKIAIOSFODNN7EXAMPLE" };
    redactObject(obj);
    expect(obj.key).toBe("AKIAIOSFODNN7EXAMPLE");
  });
});
