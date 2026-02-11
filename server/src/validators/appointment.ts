import { z } from "zod";

export const createAppointmentSchema = z.object({
  scheduledAt: z.string().datetime(),
  type: z.enum(["valuation", "treatment", "follow_up"]).default("treatment"),
  zones: z.array(z.string()).optional(),
  notes: z.string().optional()
});

export const cancelAppointmentSchema = z.object({
  reason: z.string().optional()
});

export const updateAppointmentSchema = z.object({
  status: z.enum(["pending", "confirmed", "in_progress", "completed", "canceled", "no_show"]).optional(),
  staffUserId: z.string().optional(),
  notes: z.string().optional(),
  zones: z.array(z.string()).optional()
});
