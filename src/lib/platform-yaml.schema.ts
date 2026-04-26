import { z } from "zod";

/**
 * Site name validator (D19 + D37 carry forward).
 *
 * Rules:
 *   - Lowercase letters, digits, single hyphens.
 *   - 1–63 characters.
 *   - No leading or trailing hyphen.
 *   - No consecutive hyphens.
 *
 * Becomes: `<site>.freecode.camp` and `<site>.preview.freecode.camp`.
 */
export const SITE_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const siteName = z
  .string()
  .min(1, "site is required")
  .max(63, "site must be at most 63 characters")
  .regex(
    SITE_NAME_PATTERN,
    "site must be lowercase letters, digits, and single hyphens; no leading/trailing/consecutive hyphens",
  );

const buildSchema = z
  .object({
    command: z.string().min(1).optional(),
    output: z.string().min(1).default("dist"),
  })
  .strict();

/** Sane defaults for the upload-set ignore list (gitignore-style). */
export const DEFAULT_DEPLOY_IGNORE: readonly string[] = Object.freeze([
  "*.map",
  "node_modules/**",
  ".git/**",
  ".env*",
]);

const deploySchema = z
  .object({
    preview: z.boolean().default(true),
    ignore: z.array(z.string()).default([...DEFAULT_DEPLOY_IGNORE]),
  })
  .strict()
  .prefault({});

/**
 * `platform.yaml` v2 — locked per D016 / DECISIONS Q9–Q15.
 *
 * Removed from v1:
 *   - `r2.*` block (proxy holds R2 admin credentials)
 *   - `region`, `bucket`, `key`, `endpoint` (out of staff hands)
 *   - Per-site team declaration (server-side static map per Q11)
 *
 * Strict: unknown root keys are rejected so accidental v1 fragments surface.
 */
export const platformYamlSchemaV2 = z
  .object({
    site: siteName,
    build: buildSchema.optional(),
    deploy: deploySchema,
  })
  .strict();

export type PlatformYamlV2 = z.infer<typeof platformYamlSchemaV2>;
