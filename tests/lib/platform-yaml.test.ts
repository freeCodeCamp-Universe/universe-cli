import { describe, expect, it } from "vitest";
import { parsePlatformYaml } from "../../src/lib/platform-yaml.js";

const valid = `site: my-site\n`;

describe("parsePlatformYaml — v2 schema", () => {
  describe("happy path", () => {
    it("accepts minimal valid file (site only)", () => {
      const r = parsePlatformYaml(valid);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.site).toBe("my-site");
        expect(r.value.deploy.preview).toBe(true);
        expect(r.value.deploy.ignore).toEqual([
          "*.map",
          "node_modules/**",
          ".git/**",
          ".env*",
        ]);
        // F3 — build defaults via schema prefault to keep
        // `config.build.output` reachable without `?? "dist"` fallback
        // in command code.
        expect(r.value.build).toEqual({ output: "dist" });
        expect(r.value.build.command).toBeUndefined();
      }
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
      if (r.ok) {
        expect(r.value.build).toEqual({
          command: "bun run build",
          output: "dist",
        });
        expect(r.value.deploy.preview).toBe(false);
        expect(r.value.deploy.ignore).toEqual(["*.log"]);
      }
    });

    it("defaults build.output to 'dist' when only command given", () => {
      const text = "site: my-site\nbuild:\n  command: npm run build\n";
      const r = parsePlatformYaml(text);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.build.output).toBe("dist");
      }
    });
  });

  describe("required fields", () => {
    it("rejects empty document", () => {
      const r = parsePlatformYaml("");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/site/i);
    });

    it("rejects missing site", () => {
      const r = parsePlatformYaml("build:\n  command: x\n");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/site/i);
    });

    it("rejects non-object root", () => {
      const r = parsePlatformYaml("- a\n- b\n");
      expect(r.ok).toBe(false);
    });
  });

  describe("site name validation (D19 + D37)", () => {
    const bad: Array<[string, string]> = [
      ["uppercase", "MySite"],
      ["leading hyphen", "-my-site"],
      ["trailing hyphen", "my-site-"],
      ["consecutive hyphens", "my--site"],
      ["underscore", "my_site"],
      ["dot", "my.site"],
      ["space", "my site"],
      ["empty", ""],
      ["64 chars", "a".repeat(64)],
    ];
    for (const [label, name] of bad) {
      it(`rejects ${label}: '${name}'`, () => {
        const r = parsePlatformYaml(`site: '${name}'\n`);
        expect(r.ok).toBe(false);
      });
    }

    const good: string[] = [
      "a",
      "my-site",
      "my-site-1",
      "site2",
      "1site",
      "a".repeat(63),
    ];
    for (const name of good) {
      it(`accepts '${name}'`, () => {
        const r = parsePlatformYaml(`site: '${name}'\n`);
        expect(r.ok).toBe(true);
      });
    }
  });

  describe("v1 migration detection", () => {
    it("rejects v1 with r2.* block and points at migration doc", () => {
      const text = [
        "site: my-site",
        "r2:",
        "  bucket: my-bucket",
        "  region: auto",
        "",
      ].join("\n");
      const r = parsePlatformYaml(text);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error).toMatch(/v1/i);
        expect(r.error).toMatch(/docs\/platform-yaml\.md/);
        expect(r.error).toMatch(/migration/i);
      }
    });

    it("rejects v1 marker `stack`", () => {
      const r = parsePlatformYaml("name: x\nstack: static\n");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/v1/i);
    });

    it("rejects v1 marker `domain`", () => {
      const r = parsePlatformYaml(
        "site: my-site\ndomain:\n  production: x\n  preview: y\n",
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/v1/i);
    });

    it("rejects v1 marker `static` block", () => {
      const r = parsePlatformYaml("site: my-site\nstatic:\n  bucket: x\n");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/v1/i);
    });

    it("rejects v1 marker `name` (replaced by `site`)", () => {
      const r = parsePlatformYaml("name: my-site\n");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/v1/i);
    });
  });

  describe("strict unknown keys", () => {
    it("rejects unknown root key", () => {
      const r = parsePlatformYaml("site: my-site\nfoo: bar\n");
      expect(r.ok).toBe(false);
    });

    it("rejects unknown build key", () => {
      const r = parsePlatformYaml(
        "site: my-site\nbuild:\n  command: x\n  unknown: y\n",
      );
      expect(r.ok).toBe(false);
    });

    it("rejects unknown deploy key", () => {
      const r = parsePlatformYaml(
        "site: my-site\ndeploy:\n  preview: true\n  unknown: 1\n",
      );
      expect(r.ok).toBe(false);
    });
  });

  describe("type coercion guards", () => {
    it("rejects deploy.preview as string", () => {
      const r = parsePlatformYaml("site: my-site\ndeploy:\n  preview: 'yes'\n");
      expect(r.ok).toBe(false);
    });

    it("rejects deploy.ignore as string", () => {
      const r = parsePlatformYaml(
        "site: my-site\ndeploy:\n  ignore: '*.log'\n",
      );
      expect(r.ok).toBe(false);
    });

    it("rejects empty build.output", () => {
      const r = parsePlatformYaml(
        "site: my-site\nbuild:\n  command: x\n  output: ''\n",
      );
      expect(r.ok).toBe(false);
    });
  });
});
