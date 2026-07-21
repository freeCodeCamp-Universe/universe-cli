import { z } from "zod";

const AlwaysSchema = z.record(
  z.literal("always"),
  z.strictObject({ files: z.record(z.string(), z.string()) }),
);
type Always = z.infer<typeof AlwaysSchema>;

const DatabaseOptionSchema = z.literal(["postgresql", "redis"]);
type DatabaseOption = z.infer<typeof DatabaseOptionSchema>;

const DatabaseSchema = z.record(
  DatabaseOptionSchema,
  z.strictObject({ files: z.record(z.string(), z.string()) }),
);
type Database = z.infer<typeof DatabaseSchema>;

const RuntimeSchema = z.record(
  z.string(),
  z.strictObject({
    baseImage: z.string(),
    databases: z.array(z.string()),
    files: z.record(z.string(), z.string()),
    frameworks: z.array(z.string()),
    packageManagers: z.array(z.string()),
    services: z.array(z.string()),
  }),
);
type Runtime = z.infer<typeof RuntimeSchema>;

const PackageManagerOptionSchema = z.literal(["bun", "pnpm"]);
type PackageManagerOption = z.infer<typeof PackageManagerOptionSchema>;
const PackageManagerSchema = z.record(
  PackageManagerOptionSchema,
  z.strictObject({
    devCmd: z.array(z.string()),
    files: z.record(z.string(), z.string()),
    lockfile: z.string(),
    manifests: z.array(z.string()),
    pmInstall: z.string(),
    pmVersion: z
      .string()
      .regex(
        /^\d+\.\d+\.\d+$/,
        "pmVersion must be a semver version (major.minor.patch), e.g. 1.2.3",
      ),
    preinstall: z.string().optional(),
  }),
);
type PackageManager = z.infer<typeof PackageManagerSchema>;

const ServiceOptionSchema = z.literal(["analytics", "auth", "email"]);
type ServiceOption = z.infer<typeof ServiceOptionSchema>;
const ServiceSchema = z.record(
  ServiceOptionSchema,
  z.strictObject({ files: z.record(z.string(), z.string()) }),
);
type Service = z.infer<typeof ServiceSchema>;

const FrameworkSchema = z.record(
  z.string(),
  z.strictObject({
    devCopySource: z.string(),
    files: z.record(z.string(), z.string()),
    port: z.number(),
    skills: z.array(z.strictObject({ repo: z.string(), skill: z.string() })).optional(),
    watchSync: z.array(z.strictObject({ path: z.string(), target: z.string() })),
  }),
);
type Framework = z.infer<typeof FrameworkSchema>;

type FrameworkLayerData = Framework[string];
type PackageManagerLayerData = PackageManager[PackageManagerOption];
type RuntimeLayerData = Pick<Runtime[string], "baseImage" | "files">;

export {
  AlwaysSchema,
  DatabaseSchema,
  FrameworkSchema,
  RuntimeSchema,
  PackageManagerSchema,
  ServiceSchema,
};
export type {
  Always,
  Database,
  DatabaseOption,
  Framework,
  FrameworkLayerData,
  PackageManager,
  PackageManagerLayerData,
  PackageManagerOption,
  Runtime,
  RuntimeLayerData,
  Service,
  ServiceOption,
};
