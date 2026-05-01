import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";
import type { CreateSelections } from "../commands/create/prompt/prompt.port.js";
import type { ProjectReaderPort } from "../io/project-reader.port.js";
import { ManifestInvalidError } from "../errors/cli-errors.js";
import { RUNTIME_OPTIONS } from "../commands/create/layer-composition/schemas/layers.js";

// ---------------------------------------------------------------------------
// Schema version
// ---------------------------------------------------------------------------

const SCHEMA_VERSION = "1" as const;

// ---------------------------------------------------------------------------
// Zod schema (JSON Schema representable — no .transform or .refine)
// ---------------------------------------------------------------------------

const ManifestDomainSchema = z.object({
  preview: z.string(),
  production: z.string(),
});

const ManifestEnvironmentEntrySchema = z.object({
  branch: z.string(),
});

const ManifestEnvironmentsSchema = z.object({
  preview: ManifestEnvironmentEntrySchema,
  production: ManifestEnvironmentEntrySchema,
});

const AppPlatformManifestSchema = z.object({
  domain: ManifestDomainSchema,
  environments: ManifestEnvironmentsSchema,
  name: z.string(),
  owner: z.literal("platform-engineering"),
  resources: z.array(z.string()),
  schemaVersion: z.literal(SCHEMA_VERSION),
  services: z.array(z.string()),
  stack: z.literal("app"),
});

const StaticPlatformManifestSchema = z.object({
  domain: ManifestDomainSchema,
  environments: ManifestEnvironmentsSchema,
  name: z.string(),
  schemaVersion: z.literal(SCHEMA_VERSION),
  stack: z.literal("static"),
});

const PlatformManifestSchema = z.discriminatedUnion("stack", [
  AppPlatformManifestSchema,
  StaticPlatformManifestSchema,
]);

// ---------------------------------------------------------------------------
// TypeScript types (inferred from schema — single source of truth)
// ---------------------------------------------------------------------------

type AppPlatformManifest = z.infer<typeof AppPlatformManifestSchema>;
type StaticPlatformManifest = z.infer<typeof StaticPlatformManifestSchema>;
type PlatformManifest = z.infer<typeof PlatformManifestSchema>;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const ENVIRONMENTS = {
  preview: { branch: "preview" },
  production: { branch: "main" },
} as const;

interface PlatformManifestGenerator {
  generatePlatformManifest(input: CreateSelections): string;
  validateManifest(yaml: string, yamlPath: string): PlatformManifest;
}

const readAndValidateManifest = async (
  projectDirectory: string,
  deps: { platformManifestGenerator: PlatformManifestGenerator; projectReader: ProjectReaderPort },
): Promise<PlatformManifest> => {
  const platformYamlPath = (await import("node:path")).join(projectDirectory, "platform.yaml");
  const yaml = await deps.projectReader.readFile(platformYamlPath);
  return deps.platformManifestGenerator.validateManifest(yaml, platformYamlPath);
};

class PlatformManifestService implements PlatformManifestGenerator {
  generatePlatformManifest(input: CreateSelections): string {
    const manifest = this.buildManifest(input);
    return stringifyYaml(manifest);
  }

  validateManifest(yaml: string, yamlPath: string): PlatformManifest {
    try {
      const parsed = parseYaml(yaml) as unknown;
      return PlatformManifestSchema.parse(parsed);
    } catch (e) {
      throw new ManifestInvalidError(yamlPath, e instanceof Error ? e.message : String(e));
    }
  }

  private buildManifest(input: CreateSelections): PlatformManifest {
    const domain = {
      preview: `${input.name}.preview.example.com`,
      production: `${input.name}.example.com`,
    };

    if (input.runtime === RUNTIME_OPTIONS.STATIC_WEB) {
      const manifest: StaticPlatformManifest = {
        domain,
        environments: ENVIRONMENTS,
        name: input.name,
        schemaVersion: SCHEMA_VERSION,
        stack: "static",
      };
      return manifest;
    }

    const services = input.platformServices.sort();

    const resources = input.databases.sort();

    const manifest: AppPlatformManifest = {
      domain,
      environments: ENVIRONMENTS,
      name: input.name,
      owner: "platform-engineering",
      resources,
      schemaVersion: SCHEMA_VERSION,
      services,
      stack: "app",
    };
    return manifest;
  }
}

export { PlatformManifestSchema, PlatformManifestService, readAndValidateManifest };
export type {
  AppPlatformManifest,
  PlatformManifest,
  StaticPlatformManifest,
  PlatformManifestGenerator,
};
