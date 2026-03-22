import { z } from "zod";

export const medicalIntakeUpdateSchema = z.object({
  personalJson: z.record(z.unknown()).optional(),
  historyJson: z.record(z.unknown()).optional(),
  phototype: z.number().int().min(1).max(6).nullish(),
  consentAccepted: z.boolean().optional(),
  signatureKey: z.string().min(3).optional(),
  status: z.enum(["draft", "submitted"]).optional()
});

export const medicalIntakeApproveSchema = z.object({
  approved: z.boolean(),
  rejectionReason: z.string().min(3).optional()
});
