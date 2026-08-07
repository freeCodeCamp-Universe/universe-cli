import { z } from "zod";

const AlwaysSchema = z.record(z.literal("always"), z.strictObject({}));
type Always = z.infer<typeof AlwaysSchema>;

const DatabaseOptionSchema = z.literal(["postgresql", "redis"]);
type DatabaseOption = z.infer<typeof DatabaseOptionSchema>;

const DatabaseSchema = z.record(DatabaseOptionSchema, z.strictObject({}));
type Database = z.infer<typeof DatabaseSchema>;

const RuntimeSchema = z.record(
  z.string(),
  z.strictObject({
    baseImage: z.string(),
    databases: z.array(z.string()),
    frameworks: z.array(z.string()),
    packageManagers: z.array(z.string()),
    recommended: z.boolean().optional(),
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
    recommended: z.boolean().optional(),
  }),
);
type PackageManager = z.infer<typeof PackageManagerSchema>;

const ServiceOptionSchema = z.literal(["analytics", "auth", "email"]);
type ServiceOption = z.infer<typeof ServiceOptionSchema>;
const ServiceSchema = z.record(ServiceOptionSchema, z.strictObject({}));
type Service = z.infer<typeof ServiceSchema>;

const FrameworkSchema = z.record(
  z.string(),
  z.strictObject({
    devContainer: z.record(z.string(), z.unknown()).optional(),
    devCopySource: z.string(),
    port: z.number(),
    recommended: z.boolean().optional(),
    skills: z.array(z.strictObject({ repo: z.string(), skill: z.string() })).optional(),
    watchSync: z.array(z.strictObject({ path: z.string(), target: z.string() })),
  }),
);
type Framework = z.infer<typeof FrameworkSchema>;

type RuntimeLayerData = Pick<Runtime[string], "baseImage">;

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
  PackageManager,
  PackageManagerOption,
  Runtime,
  RuntimeLayerData,
  Service,
  ServiceOption,
};
