import { z } from "zod";

/**
 * GitHub repo-name semantics carried verbatim from the Windmill flow
 * (`f/repo_mgmt/types.ts`): start with a letter or digit, then letters,
 * digits, `.`, `_`, `-`; max 100 chars. Mixed-case is accepted by
 * GitHub; the interactive hint nudges toward lowercase.
 */
export const REPO_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/;

/** Target org for every created repo. Server is authoritative. */
export const REPO_OWNER = "freeCodeCamp-Universe" as const;

const repoName = z
  .string()
  .regex(
    REPO_NAME_RE,
    "must start with a letter or digit, then letters, digits, '.', '_' or '-' (max 100 chars)",
  );

export const visibilitySchema = z.enum(["public", "private"]);
export type Visibility = z.infer<typeof visibilitySchema>;

export const repoStatusSchema = z.enum([
  "pending",
  "approved",
  "active",
  "rejected",
  "failed",
]);
export type RepoStatus = z.infer<typeof repoStatusSchema>;

/**
 * Body of `repo create`. `template` is omitted (never empty string) for a
 * blank repo — the empty-string footgun the Chat flow guarded against.
 */
export const createRepoRequestSchema = z
  .object({
    name: repoName,
    visibility: visibilitySchema.default("private"),
    description: z.string().max(350).optional(),
    template: repoName.optional(),
  })
  .strict();
export type CreateRepoRequestInput = z.input<typeof createRepoRequestSchema>;
export type CreateRepoRequest = z.infer<typeof createRepoRequestSchema>;

/**
 * Canonical request row returned by every `/api/repo*` endpoint. camelCase
 * mirrors the artemis Go struct tags (see dossier §I); unknown keys are
 * stripped so server-side additions stay forward-compatible.
 */
export const repoRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  owner: z.string(),
  visibility: visibilitySchema,
  description: z.string().optional(),
  template: z.string().optional(),
  status: repoStatusSchema,
  url: z.string().optional(),
  error: z.string().optional(),
  requestedBy: z.string(),
  approver: z.string().optional(),
  rejectReason: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RepoRow = z.infer<typeof repoRowSchema>;

export const repoRowArraySchema = z.array(repoRowSchema);

export const repoApproveResultSchema = z.object({
  outcome: z.enum(["ok", "approved_failed"]),
  request: repoRowSchema,
});

export const repoTemplatesResponseSchema = z.object({
  templates: z.array(z.string()),
});
