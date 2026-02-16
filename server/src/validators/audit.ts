import { z } from "zod";

export const auditFilterSchema = z.object({
  actorUserId: z.string().min(3).optional(),
  resourceType: z.string().min(1).optional(),
  result: z.enum(["success", "failed"]).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional()
});
