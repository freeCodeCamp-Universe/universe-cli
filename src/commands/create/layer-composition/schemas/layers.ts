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

const RUNTIME_OPTIONS = { NODE: "node", STATIC_WEB: "static_web" } as const;
const RuntimeOptionSchema = z.literal(Object.values(RUNTIME_OPTIONS));
type RuntimeOption = z.infer<typeof RuntimeOptionSchema>;
const RuntimeSchema = z.record(
  RuntimeOptionSchema,
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

const FrameworkOptionSchema = z.literal([
  "express",
  "html-css-js",
  "react-vite",
  "tanstack-shadcn",
  "typescript",
]);
type FrameworkOption = z.infer<typeof FrameworkOptionSchema>;
const FrameworkSchema = z.record(
  FrameworkOptionSchema,
  z.strictObject({
    devCopySource: z.string(),
    files: z.record(z.string(), z.string()),
    port: z.number(),
    watchSync: z.array(z.strictObject({ path: z.string(), target: z.string() })),
  }),
);
type Framework = z.infer<typeof FrameworkSchema>;

type FrameworkLayerData = Framework[FrameworkOption];
type PackageManagerLayerData = PackageManager[PackageManagerOption];
type RuntimeLayerData = Pick<Runtime[RuntimeOption], "baseImage" | "files">;

export {
  AlwaysSchema,
  DatabaseSchema,
  FrameworkSchema,
  RuntimeSchema,
  PackageManagerSchema,
  ServiceSchema,
  RUNTIME_OPTIONS,
};
export type {
  Always,
  Database,
  DatabaseOption,
  Framework,
  FrameworkLayerData,
  FrameworkOption,
  PackageManager,
  PackageManagerLayerData,
  PackageManagerOption,
  Runtime,
  RuntimeLayerData,
  RuntimeOption,
  Service,
  ServiceOption,
};
