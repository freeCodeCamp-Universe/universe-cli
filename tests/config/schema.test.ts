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
    },
    woodpecker: {
      endpoint: "https://woodpecker.example",
      repo_id: 42,
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
      woodpecker: {
        endpoint: "https://woodpecker.example",
        repo_id: 1,
      },
    };
    const result = platformSchema.parse(minimal);
    expect(result.static.output_dir).toBe("dist");
  });

  it("rejects legacy static.rclone_remote field (strict)", () => {
    const result = platformSchema.safeParse({
      ...validConfig,
      static: { output_dir: "dist", rclone_remote: "r2" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects legacy static.bucket field (strict)", () => {
    const result = platformSchema.safeParse({
      ...validConfig,
      static: { output_dir: "dist", bucket: "foo" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects legacy static.region field (strict)", () => {
    const result = platformSchema.safeParse({
      ...validConfig,
      static: { output_dir: "dist", region: "auto" },
    });
    expect(result.success).toBe(false);
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

  it("allows static override of output_dir", () => {
    const partial = {
      ...validConfig,
      static: { output_dir: "build" },
    };
    const result = platformSchema.parse(partial);
    expect(result.static.output_dir).toBe("build");
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

  describe("woodpecker section", () => {
    it("rejects config missing the woodpecker section", () => {
      const { woodpecker: _w, ...noWoodpecker } = validConfig;
      const result = platformSchema.safeParse(noWoodpecker);
      expect(result.success).toBe(false);
    });

    it("rejects woodpecker with empty endpoint", () => {
      const result = platformSchema.safeParse({
        ...validConfig,
        woodpecker: { endpoint: "", repo_id: 1 },
      });
      expect(result.success).toBe(false);
    });

    it("rejects woodpecker with non-integer repo_id", () => {
      const result = platformSchema.safeParse({
        ...validConfig,
        woodpecker: { endpoint: "https://wp.example", repo_id: 1.5 },
      });
      expect(result.success).toBe(false);
    });

    it("rejects woodpecker with negative repo_id", () => {
      const result = platformSchema.safeParse({
        ...validConfig,
        woodpecker: { endpoint: "https://wp.example", repo_id: -1 },
      });
      expect(result.success).toBe(false);
    });

    it("accepts a valid woodpecker section", () => {
      const result = platformSchema.safeParse({
        ...validConfig,
        woodpecker: {
          endpoint: "https://woodpecker.freecodecamp.net",
          repo_id: 99,
        },
      });
      expect(result.success).toBe(true);
    });
  });
});
