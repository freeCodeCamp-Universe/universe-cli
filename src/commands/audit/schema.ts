import { z } from "zod";

export const auditRowSchema = z.object({
  id: z.number(),
  occurredAt: z.string(),
  actor: z.string(),
  action: z.string(),
  site: z.string().optional(),
  deployId: z.string().optional(),
  outcome: z.string(),
  requestId: z.string().optional(),
  detail: z.record(z.string(), z.unknown()).optional(),
});

export const auditRowArraySchema = z.array(auditRowSchema);
