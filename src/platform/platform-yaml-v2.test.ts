import { parsePlatformYaml } from "./platform-yaml-v2.js";
import type { PlatformYamlV2 } from "./platform-yaml-v2.js";

const valid = `site: my-site\n`;

describe("parsePlatformYaml — v2 schema", () => {
  describe("happy path", () => {
    it("accepts minimal valid file (site only)", () => {
      const r = parsePlatformYaml(valid);
      expect(r.ok).toBe(true);
      assert(r.ok);
      expect(r.value.site).toBe("my-site");
      expect(r.value.deploy.preview).toBe(true);
      expect(r.value.deploy.ignore).toStrictEqual(["*.map", "node_modules/**", ".git/**", ".env*"]);
      expect(r.value.build).toStrictEqual({ output: "dist" });
    });

    it("accepts full file with build + deploy", () => {
      const text = [
        "site: my-site",
        "build:",
        "  command: bun run build",
        "  output: dist",
        "deploy:",
        "  preview: false",
        "  ignore:",
        "    - '*.log'",
        "",
      ].join("\n");
      const r = parsePlatformYaml(text);
      expect(r.ok).toBe(true);
      assert(r.ok);
      expect(r.value.build).toStrictEqual({ command: "bun run build", output: "dist" });
      expect(r.value.deploy.preview).toBe(false);
      expect(r.value.deploy.ignore).toStrictEqual(["*.log"]);
    });

    it("defaults build.output to 'dist' when only command given", () => {
      const text = "site: my-site\nbuild:\n  command: npm run build\n";
      const r = parsePlatformYaml(text);
      expect(r.ok).toBe(true);
      assert(r.ok);
      expect(r.value.build.output).toBe("dist");
    });

    it("platformYamlV2 type is exported and usable", () => {
      const r = parsePlatformYaml(valid);
      assert(r.ok);
      const v: PlatformYamlV2 = r.value;
      expect(v.site).toBeDefined();
    });
  });

  describe("required fields", () => {
    it("rejects empty document", () => {
      const r = parsePlatformYaml("");
      expect(r.ok).toBe(false);
      expect((r as { error: string }).error).toMatch(/site/i);
    });

    it("rejects missing site", () => {
      const r = parsePlatformYaml("build:\n  command: x\n");
      expect(r.ok).toBe(false);
      expect((r as { error: string }).error).toMatch(/site/i);
    });

    it("rejects non-object root", () => {
      const r = parsePlatformYaml("- a\n- b\n");
      expect(r.ok).toBe(false);
    });
  });

  describe("site name validation", () => {
    it.each<[string, string]>([
      ["uppercase", "MySite"],
      ["leading hyphen", "-my-site"],
      ["trailing hyphen", "my-site-"],
      ["consecutive hyphens", "my--site"],
      ["underscore", "my_site"],
      ["space", "my site"],
      ["empty", ""],
      ["64 chars", "a".repeat(64)],
    ])("rejects %s: '%s'", (_label, name) => {
      const r = parsePlatformYaml(`site: '${name}'\n`);
      expect(r.ok).toBe(false);
    });

    it.each(["a", "my-site", "my-site-1", "site2", "1site", "a".repeat(63)])(
      "accepts '%s'",
      (name) => {
        const r = parsePlatformYaml(`site: '${name}'\n`);
        expect(r.ok).toBe(true);
      },
    );
  });

  describe("v1 migration detection", () => {
    it("rejects v1 with r2 block and points at migration doc", () => {
      const text = ["site: my-site", "r2:", "  bucket: my-bucket", "  region: auto", ""].join("\n");
      const r = parsePlatformYaml(text);
      expect(r.ok).toBe(false);
      const { error } = r as { error: string };
      expect(error).toMatch(/v1/i);
      expect(error).toMatch(/docs\/platform-yaml\.md/);
      expect(error).toMatch(/migration/i);
    });

    it("rejects v1 marker `stack`", () => {
      const r = parsePlatformYaml("name: x\nstack: static\n");
      expect(r.ok).toBe(false);
      expect((r as { error: string }).error).toMatch(/v1/i);
    });

    it("rejects v1 marker `domain`", () => {
      const r = parsePlatformYaml("site: my-site\ndomain:\n  production: x\n  preview: y\n");
      expect(r.ok).toBe(false);
      expect((r as { error: string }).error).toMatch(/v1/i);
    });

    it("rejects v1 marker `static` block", () => {
      const r = parsePlatformYaml("site: my-site\nstatic:\n  bucket: x\n");
      expect(r.ok).toBe(false);
      expect((r as { error: string }).error).toMatch(/v1/i);
    });

    it("rejects v1 marker `name`", () => {
      const r = parsePlatformYaml("name: my-site\n");
      expect(r.ok).toBe(false);
      expect((r as { error: string }).error).toMatch(/v1/i);
    });
  });

  describe("strict unknown keys", () => {
    it("rejects unknown root key", () => {
      const r = parsePlatformYaml("site: my-site\nfoo: bar\n");
      expect(r.ok).toBe(false);
    });

    it("rejects unknown build key", () => {
      const r = parsePlatformYaml("site: my-site\nbuild:\n  command: x\n  unknown: y\n");
      expect(r.ok).toBe(false);
    });

    it("rejects unknown deploy key", () => {
      const r = parsePlatformYaml("site: my-site\ndeploy:\n  preview: true\n  unknown: 1\n");
      expect(r.ok).toBe(false);
    });
  });

  describe("type coercion guards", () => {
    it("rejects deploy.preview as string", () => {
      const r = parsePlatformYaml("site: my-site\ndeploy:\n  preview: 'yes'\n");
      expect(r.ok).toBe(false);
    });

    it("rejects deploy.ignore as string", () => {
      const r = parsePlatformYaml("site: my-site\ndeploy:\n  ignore: '*.log'\n");
      expect(r.ok).toBe(false);
    });

    it("rejects empty build.output", () => {
      const r = parsePlatformYaml("site: my-site\nbuild:\n  command: x\n  output: ''\n");
      expect(r.ok).toBe(false);
    });
  });
});
