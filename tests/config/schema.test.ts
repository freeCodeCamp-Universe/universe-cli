import { describe, it, expect } from "vitest";
import { platformSchema } from "../../src/config/schema.js";

describe("platformSchema", () => {
  const validConfig = {
    name: "my-site",
    stack: "static" as const,
    domain: {
      production: "my-site.com",
      preview: "preview.my-site.com",
    },
    static: {
      output_dir: "dist",
      bucket: "gxy-static-1",
      rclone_remote: "gxy-static",
      region: "auto",
    },
  };

  it("accepts a fully specified valid config", () => {
    const result = platformSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it("applies defaults for static fields when omitted", () => {
    const minimal = {
      name: "my-site",
      stack: "static",
      domain: {
        production: "my-site.com",
        preview: "preview.my-site.com",
      },
    };
    const result = platformSchema.parse(minimal);
    expect(result.static.output_dir).toBe("dist");
    expect(result.static.bucket).toBe("gxy-static-1");
    expect(result.static.rclone_remote).toBe("gxy-static");
    expect(result.static.region).toBe("auto");
  });

  it("rejects config with missing name", () => {
    const { name: _name, ...noName } = validConfig;
    const result = platformSchema.safeParse(noName);
    expect(result.success).toBe(false);
  });

  it("rejects config with wrong stack value", () => {
    const result = platformSchema.safeParse({
      ...validConfig,
      stack: "dynamic",
    });
    expect(result.success).toBe(false);
  });

  it("rejects config with empty name string", () => {
    const result = platformSchema.safeParse({ ...validConfig, name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects config with missing domain", () => {
    const { domain: _domain, ...noDomain } = validConfig;
    const result = platformSchema.safeParse(noDomain);
    expect(result.success).toBe(false);
  });

  it("rejects config with empty production domain", () => {
    const result = platformSchema.safeParse({
      ...validConfig,
      domain: { ...validConfig.domain, production: "" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects config with empty preview domain", () => {
    const result = platformSchema.safeParse({
      ...validConfig,
      domain: { ...validConfig.domain, preview: "" },
    });
    expect(result.success).toBe(false);
  });

  it("allows partial static overrides and fills remaining defaults", () => {
    const partial = {
      ...validConfig,
      static: { output_dir: "build" },
    };
    const result = platformSchema.parse(partial);
    expect(result.static.output_dir).toBe("build");
    expect(result.static.bucket).toBe("gxy-static-1");
    expect(result.static.rclone_remote).toBe("gxy-static");
    expect(result.static.region).toBe("auto");
  });

  it("accepts a single hyphen in the site name", () => {
    const result = platformSchema.safeParse({
      ...validConfig,
      name: "foo-bar",
    });
    expect(result.success).toBe(true);
  });

  it("rejects consecutive hyphens in the site name (D19)", () => {
    const result = platformSchema.safeParse({
      ...validConfig,
      name: "foo--bar",
    });
    expect(result.success).toBe(false);
  });
});
