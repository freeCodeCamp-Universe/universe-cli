import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveCredentials } from "../../src/credentials/resolver.js";
import * as childProcess from "node:child_process";

vi.mock("node:child_process");

const validRcloneDump = JSON.stringify({
  "gxy-static": {
    type: "s3",
    provider: "Other",
    access_key_id: "rclone-key",
    secret_access_key: "rclone-secret",
    endpoint: "https://s3.example.com",
  },
});

describe("resolveCredentials", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe("env var source", () => {
    it("rejects plaintext http S3_ENDPOINT for non-localhost hosts", async () => {
      const { CredentialError } = await import("../../src/errors.js");
      vi.stubEnv("S3_ACCESS_KEY_ID", "env-key");
      vi.stubEnv("S3_SECRET_ACCESS_KEY", "env-secret");
      vi.stubEnv("S3_ENDPOINT", "http://evil.example.com");
      expect(() => resolveCredentials({ remoteName: "gxy-static" })).toThrow(
        CredentialError,
      );
    });

    it("rejects S3_ENDPOINT containing userinfo", async () => {
      const { CredentialError } = await import("../../src/errors.js");
      vi.stubEnv("S3_ACCESS_KEY_ID", "env-key");
      vi.stubEnv("S3_SECRET_ACCESS_KEY", "env-secret");
      vi.stubEnv("S3_ENDPOINT", "https://user:pass@host.example.com");
      expect(() => resolveCredentials({ remoteName: "gxy-static" })).toThrow(
        CredentialError,
      );
    });

    it("allows http S3_ENDPOINT for localhost (integration tests)", () => {
      vi.stubEnv("S3_ACCESS_KEY_ID", "env-key");
      vi.stubEnv("S3_SECRET_ACCESS_KEY", "env-secret");
      vi.stubEnv("S3_ENDPOINT", "http://localhost:9000");
      const creds = resolveCredentials({ remoteName: "gxy-static" });
      expect(creds.endpoint).toBe("http://localhost:9000");
    });

    it("allows http S3_ENDPOINT for 127.0.0.1", () => {
      vi.stubEnv("S3_ACCESS_KEY_ID", "env-key");
      vi.stubEnv("S3_SECRET_ACCESS_KEY", "env-secret");
      vi.stubEnv("S3_ENDPOINT", "http://127.0.0.1:9000");
      const creds = resolveCredentials({ remoteName: "gxy-static" });
      expect(creds.endpoint).toBe("http://127.0.0.1:9000");
    });

    it("rejects malformed S3_ENDPOINT", async () => {
      const { CredentialError } = await import("../../src/errors.js");
      vi.stubEnv("S3_ACCESS_KEY_ID", "env-key");
      vi.stubEnv("S3_SECRET_ACCESS_KEY", "env-secret");
      vi.stubEnv("S3_ENDPOINT", "not a url");
      expect(() => resolveCredentials({ remoteName: "gxy-static" })).toThrow(
        CredentialError,
      );
    });

    it("returns credentials from env when all three required vars are set", () => {
      vi.stubEnv("S3_ACCESS_KEY_ID", "env-key");
      vi.stubEnv("S3_SECRET_ACCESS_KEY", "env-secret");
      vi.stubEnv("S3_ENDPOINT", "https://env.endpoint.com");

      const creds = resolveCredentials({ remoteName: "gxy-static" });

      expect(creds).toEqual({
        accessKeyId: "env-key",
        secretAccessKey: "env-secret",
        endpoint: "https://env.endpoint.com",
      });
    });

    it("includes optional S3_REGION when set", () => {
      vi.stubEnv("S3_ACCESS_KEY_ID", "env-key");
      vi.stubEnv("S3_SECRET_ACCESS_KEY", "env-secret");
      vi.stubEnv("S3_ENDPOINT", "https://env.endpoint.com");
      vi.stubEnv("S3_REGION", "us-east-1");

      const creds = resolveCredentials({ remoteName: "gxy-static" });

      expect(creds).toEqual({
        accessKeyId: "env-key",
        secretAccessKey: "env-secret",
        endpoint: "https://env.endpoint.com",
        region: "us-east-1",
      });
    });

    it("rejects partial env: key without secret", () => {
      vi.stubEnv("S3_ACCESS_KEY_ID", "env-key");

      expect(() => resolveCredentials({ remoteName: "gxy-static" })).toThrow(
        /partial/i,
      );
    });

    it("rejects partial env: key and secret without endpoint", () => {
      vi.stubEnv("S3_ACCESS_KEY_ID", "env-key");
      vi.stubEnv("S3_SECRET_ACCESS_KEY", "env-secret");

      expect(() => resolveCredentials({ remoteName: "gxy-static" })).toThrow(
        /partial/i,
      );
    });

    it("rejects partial env: endpoint without key", () => {
      vi.stubEnv("S3_ENDPOINT", "https://env.endpoint.com");

      expect(() => resolveCredentials({ remoteName: "gxy-static" })).toThrow(
        /partial/i,
      );
    });

    it("does not fall back to rclone when env vars are complete", () => {
      vi.stubEnv("S3_ACCESS_KEY_ID", "env-key");
      vi.stubEnv("S3_SECRET_ACCESS_KEY", "env-secret");
      vi.stubEnv("S3_ENDPOINT", "https://env.endpoint.com");

      resolveCredentials({ remoteName: "gxy-static" });

      expect(childProcess.execSync).not.toHaveBeenCalled();
    });
  });

  describe("rclone fallback", () => {
    it("parses credentials from rclone config dump JSON", () => {
      vi.mocked(childProcess.execSync).mockReturnValue(
        Buffer.from(validRcloneDump),
      );

      const creds = resolveCredentials({ remoteName: "gxy-static" });

      expect(childProcess.execSync).toHaveBeenCalledWith("rclone config dump", {
        stdio: "pipe",
      });
      expect(creds).toEqual({
        accessKeyId: "rclone-key",
        secretAccessKey: "rclone-secret",
        endpoint: "https://s3.example.com",
      });
    });

    it("includes region from rclone when present", () => {
      const dumpWithRegion = JSON.stringify({
        "gxy-static": {
          type: "s3",
          access_key_id: "rclone-key",
          secret_access_key: "rclone-secret",
          endpoint: "https://s3.example.com",
          region: "eu-west-1",
        },
      });
      vi.mocked(childProcess.execSync).mockReturnValue(
        Buffer.from(dumpWithRegion),
      );

      const creds = resolveCredentials({ remoteName: "gxy-static" });

      expect(creds.region).toBe("eu-west-1");
    });

    it("throws clear error when remote name is not found in rclone dump", () => {
      const noMatch = JSON.stringify({ "other-remote": { type: "s3" } });
      vi.mocked(childProcess.execSync).mockReturnValue(Buffer.from(noMatch));

      expect(() => resolveCredentials({ remoteName: "gxy-static" })).toThrow(
        /gxy-static/,
      );
    });

    it("throws clear error when rclone output is malformed JSON", () => {
      vi.mocked(childProcess.execSync).mockReturnValue(
        Buffer.from("not json at all {{{"),
      );

      expect(() => resolveCredentials({ remoteName: "gxy-static" })).toThrow(
        /failed to parse rclone config/i,
      );
    });

    it("does NOT include raw rclone output in error for malformed JSON", () => {
      vi.mocked(childProcess.execSync).mockReturnValue(
        Buffer.from("secret-leak-value {{{"),
      );

      try {
        resolveCredentials({ remoteName: "gxy-static" });
        expect.fail("should have thrown");
      } catch (err: unknown) {
        const msg = (err as Error).message;
        expect(msg).not.toContain("secret-leak-value");
        expect(msg).toMatch(/failed to parse rclone config/i);
      }
    });

    it("throws clear error when rclone is not installed (ENOENT)", () => {
      vi.mocked(childProcess.execSync).mockImplementation(() => {
        const err = new Error("ENOENT") as NodeJS.ErrnoException;
        err.code = "ENOENT";
        throw err;
      });

      expect(() => resolveCredentials({ remoteName: "gxy-static" })).toThrow(
        /rclone not found/i,
      );
    });

    it("does NOT leak credentials in error when rclone config dump fails", () => {
      vi.mocked(childProcess.execSync).mockImplementation(() => {
        const err = new Error(
          "rclone config dump failed: access_key_id=AKIAIOSFODNN7EXAMPLE secret=wJalrXUtnFEMI/K7MDENG",
        );
        throw err;
      });

      try {
        resolveCredentials({ remoteName: "gxy-static" });
        expect.fail("should have thrown");
      } catch (err: unknown) {
        const msg = (err as Error).message;
        expect(msg).not.toContain("AKIAIOSFODNN7EXAMPLE");
        expect(msg).not.toContain("wJalrXUtnFEMI/K7MDENG");
        expect(msg).toContain("****");
      }
    });

    it("throws clear error when rclone remote is missing required fields", () => {
      const incomplete = JSON.stringify({
        "gxy-static": {
          type: "s3",
          access_key_id: "rclone-key",
        },
      });
      vi.mocked(childProcess.execSync).mockReturnValue(Buffer.from(incomplete));

      expect(() => resolveCredentials({ remoteName: "gxy-static" })).toThrow(
        /secret_access_key|endpoint/i,
      );
    });
  });
});
