import { z } from "zod";

export const sessionCreateSchema = z.object({
  appointmentId: z.string().min(3).optional(),
  userId: z.string().min(3),
  laserParametersJson: z.record(z.unknown()).optional(),
  notes: z.string().min(1).optional(),
  adverseEvents: z.string().min(1).optional()
});

export const sessionFeedbackSchema = z.object({
  memberFeedback: z.string().min(3)
});
