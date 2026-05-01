import { redact, redactObject } from "./redact.js";

describe(redact, () => {
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
    const result = redact("https://AKIAIOSFODNN7EXAMPLE:secretkey@s3.amazonaws.com/bucket");
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

  it("masks AWS STS session keys (ASIA prefix)", () => {
    const result = redact("session ASIAIOSFODNN7EXAMPLE ends");
    expect(result).not.toContain("IOSFODNN7EXA");
    expect(result).toContain("ASIA****");
  });

  it("masks AWS IAM role unique IDs (AROA prefix)", () => {
    const result = redact("role AROAIOSFODNN7EXAMPLE");
    expect(result).not.toContain("IOSFODNN7EXA");
  });

  it("masks credentials with whitespace before separator", () => {
    const result = redact("access_key_id = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY");
    expect(result).not.toContain("wJalrXUtnFEMI");
    expect(result).toContain("****");
  });

  it("masks JSON-quoted credential values", () => {
    const result = redact('{"token":"abcdef0123456789abcdef0123456789"}');
    expect(result).not.toContain("abcdef0123456789abcdef0123456789");
    expect(result).toContain("****");
  });

  it("masks Bearer authorization tokens", () => {
    const result = redact("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature");
    expect(result).not.toContain("eyJhbGciOiJIUzI1NiJ9.payload.signature");
    expect(result).toContain("****");
  });
});

describe(redactObject, () => {
  it("deep-redacts string values that look like credentials", () => {
    const obj = {
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      bucket: "my-bucket",
      nested: {
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      },
    };
    const result = redactObject(obj);
    expect(result["accessKeyId"]).toContain("****");
    expect(result["bucket"]).toBe("my-bucket");
    const nested = result["nested"] as Record<string, unknown>;
    expect(nested["secretAccessKey"]).toContain("****");
  });

  it("preserves non-string values", () => {
    const obj = { count: 42, flag: true, name: "safe-string" };
    const result = redactObject(obj);
    expect(result).toStrictEqual({ count: 42, flag: true, name: "safe-string" });
  });

  it("handles arrays inside objects", () => {
    const obj = {
      keys: ["AKIAIOSFODNN7EXAMPLE", "normal-value"],
    };
    const result = redactObject(obj);
    const keys = result["keys"] as string[];
    expect(keys[0]).toContain("****");
    expect(keys[1]).toBe("normal-value");
  });

  it("masks values for credential key names regardless of format", () => {
    const obj = {
      accessKeyId: "shortval",
      access_key_id: "cf-key-12345",
      secretAccessKey: "anyvalue",
      secret_access_key: "cf-secret-67890",
    };
    const result = redactObject(obj);
    expect(result["accessKeyId"]).toBe("****");
    expect(result["secretAccessKey"]).toBe("****");
    expect(result["access_key_id"]).toBe("****");
    expect(result["secret_access_key"]).toBe("****");
  });

  it("does not mutate the original object", () => {
    const obj = { key: "AKIAIOSFODNN7EXAMPLE" };
    redactObject(obj);
    expect(obj.key).toBe("AKIAIOSFODNN7EXAMPLE");
  });
});
