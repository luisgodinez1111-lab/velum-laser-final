import { z } from "zod";

export const auditFilterSchema = z.object({
  actorUserId: z.string().optional(),
  targetUserId: z.string().optional(),
  userId: z.string().optional(),
  action: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  result: z.enum(["success", "failed"]).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  page: z.coerce.number().int().min(1).optional()
});
