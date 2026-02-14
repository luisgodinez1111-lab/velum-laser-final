import { z } from "zod";

export const createTreatmentPlanSchema = z.object({
  userId: z.string().min(1),
  membershipId: z.string().min(1),
  zones: z.array(z.string()).min(1),
  totalSessions: z.number().int().min(1).max(24).default(10),
  notes: z.string().optional(),
});

export const updateTreatmentPlanSchema = z.object({
  completedSessions: z.number().int().min(0).optional(),
  status: z.enum(["active", "completed", "paused", "canceled"]).optional(),
  notes: z.string().optional(),
  totalSessions: z.number().int().min(1).max(24).optional(),
});
