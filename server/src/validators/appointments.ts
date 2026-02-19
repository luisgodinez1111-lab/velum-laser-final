import { z } from "zod";

export const appointmentCreateSchema = z.object({
  userId: z.string().min(3).optional(),
  cabinId: z.string().min(3).optional(),
  treatmentId: z.string().min(3).optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime().optional(),
  reason: z.string().min(1).optional()
});

export const appointmentUpdateSchema = z.object({
  action: z.enum(["reschedule", "cancel", "confirm", "complete", "mark_no_show"]),
  cabinId: z.string().min(3).optional(),
  treatmentId: z.string().min(3).optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  canceledReason: z.string().min(3).optional()
});
