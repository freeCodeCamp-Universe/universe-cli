import { z } from "zod";
import {
  SITE_NAME_MAX_LENGTH,
  SITE_NAME_REGEX,
} from "../validation/site-name.js";

const staticSchema = z
  .object({
    output_dir: z.string().min(1).default("dist"),
  })
  .strict()
  .prefault({});

const domainSchema = z.object({
  production: z.string().min(1),
  preview: z.string().min(1),
});

const woodpeckerSchema = z.object({
  endpoint: z.string().min(1).url(),
  repo_id: z.int().positive(),
});

export const platformSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(SITE_NAME_MAX_LENGTH)
    .regex(SITE_NAME_REGEX, {
      message:
        "Site name must be lowercase alphanumeric plus hyphen; no leading/trailing hyphen.",
    })
    .refine((n) => !n.includes("--"), {
      message:
        "Site name must not contain '--' (reserved for preview routing).",
    }),
  stack: z.literal("static"),
  domain: domainSchema,
  static: staticSchema,
  woodpecker: woodpeckerSchema,
});

export type PlatformConfig = z.infer<typeof platformSchema>;
