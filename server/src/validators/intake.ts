import { z } from "zod";

export const saveIntakeSchema = z.object({
  fitzpatrickType: z.string().min(1).optional(),
  questionnaire: z.record(z.unknown()).optional(),
  contraindications: z.array(z.string()).optional(),
  contraindicationNotes: z.string().optional()
});

export const signIntakeSchema = z.object({
  signature: z.string().min(10)
});

export const reviewIntakeSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  notes: z.string().optional()
});
