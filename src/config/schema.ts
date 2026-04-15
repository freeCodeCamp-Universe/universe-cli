import { z } from "zod";

const staticSchema = z
  .object({
    output_dir: z.string().min(1).default("dist"),
    bucket: z.string().min(1).default("gxy-static-1"),
    rclone_remote: z.string().min(1).default("gxy-static"),
    region: z.string().min(1).default("auto"),
  })
  .prefault({});

const domainSchema = z.object({
  production: z.string().min(1),
  preview: z.string().min(1),
});

export const platformSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/i),
  stack: z.literal("static"),
  domain: domainSchema,
  static: staticSchema,
});

export type PlatformConfig = z.infer<typeof platformSchema>;
