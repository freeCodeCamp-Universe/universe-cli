import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadConfig, type ResolvedConfig } from "../../src/config/loader.js";
import * as fs from "node:fs";
import * as yaml from "yaml";

vi.mock("node:fs");

const fullYaml = {
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

describe("loadConfig", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("reads platform.yaml from cwd, parses, and returns typed config", () => {
    vi.mocked(fs.readFileSync).mockReturnValue(yaml.stringify(fullYaml));

    const config = loadConfig({ cwd: "/fake/project" });

    expect(fs.readFileSync).toHaveBeenCalledWith(
      "/fake/project/platform.yaml",
      "utf-8",
    );
    expect(config.name).toBe("my-site");
    expect(config.stack).toBe("static");
    expect(config.domain.production).toBe("my-site.com");
    expect(config.static.output_dir).toBe("dist");
  });

  it("returns fully typed ResolvedConfig with no optional fields", () => {
    const minimalYaml = {
      name: "my-site",
      stack: "static",
      domain: {
        production: "my-site.com",
        preview: "preview.my-site.com",
      },
    };
    vi.mocked(fs.readFileSync).mockReturnValue(yaml.stringify(minimalYaml));

    const config = loadConfig({ cwd: "/fake/project" });

    expect(config.static.output_dir).toBe("dist");
    expect(config.static.bucket).toBe("gxy-static-1");
    expect(config.static.rclone_remote).toBe("gxy-static");
    expect(config.static.region).toBe("auto");
  });

  it("yaml values override schema defaults", () => {
    const customYaml = {
      ...fullYaml,
      static: { ...fullYaml.static, output_dir: "build", region: "us-east-1" },
    };
    vi.mocked(fs.readFileSync).mockReturnValue(yaml.stringify(customYaml));

    const config = loadConfig({ cwd: "/fake/project" });

    expect(config.static.output_dir).toBe("build");
    expect(config.static.region).toBe("us-east-1");
  });

  it("env vars override yaml values", () => {
    vi.mocked(fs.readFileSync).mockReturnValue(yaml.stringify(fullYaml));
    vi.stubEnv("UNIVERSE_STATIC_OUTPUT_DIR", "env-out");
    vi.stubEnv("UNIVERSE_STATIC_BUCKET", "env-bucket");

    const config = loadConfig({ cwd: "/fake/project" });

    expect(config.static.output_dir).toBe("env-out");
    expect(config.static.bucket).toBe("env-bucket");
  });

  it("flags override env and yaml values", () => {
    vi.mocked(fs.readFileSync).mockReturnValue(yaml.stringify(fullYaml));
    vi.stubEnv("UNIVERSE_STATIC_OUTPUT_DIR", "env-out");

    const config = loadConfig({
      cwd: "/fake/project",
      flags: { outputDir: "flag-out" },
    });

    expect(config.static.output_dir).toBe("flag-out");
  });

  it("throws on invalid yaml config", () => {
    const invalid = { name: "", stack: "dynamic" };
    vi.mocked(fs.readFileSync).mockReturnValue(yaml.stringify(invalid));

    expect(() => loadConfig({ cwd: "/fake/project" })).toThrow();
  });

  it("throws when platform.yaml does not exist", () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      const err = new Error("ENOENT") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    });

    expect(() => loadConfig({ cwd: "/fake/project" })).toThrow(
      /platform\.yaml/,
    );
  });

  it("resolution precedence: flags > env > yaml > defaults", () => {
    const yamlData = {
      ...fullYaml,
      static: {
        ...fullYaml.static,
        output_dir: "yaml-out",
        region: "yaml-region",
      },
    };
    vi.mocked(fs.readFileSync).mockReturnValue(yaml.stringify(yamlData));
    vi.stubEnv("UNIVERSE_STATIC_OUTPUT_DIR", "env-out");
    vi.stubEnv("UNIVERSE_STATIC_REGION", "env-region");

    const config = loadConfig({
      cwd: "/fake/project",
      flags: { outputDir: "flag-out" },
    });

    expect(config.static.output_dir).toBe("flag-out");
    expect(config.static.region).toBe("env-region");
    expect(config.static.bucket).toBe("gxy-static-1");
  });
});
