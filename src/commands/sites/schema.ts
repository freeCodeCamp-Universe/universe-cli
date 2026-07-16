import { z } from "zod";

export const deploySummarySchema = z.object({
  deployId: z.string(),
  actor: z.string().optional(),
});

export const deploySummaryArraySchema = z.array(deploySummarySchema);
