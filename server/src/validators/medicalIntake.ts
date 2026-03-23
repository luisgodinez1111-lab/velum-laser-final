import { z } from "zod";

export const medicalIntakeUpdateSchema = z.object({
  personalJson: z.record(z.string().max(500)).optional(),
  historyJson: z.record(z.string().max(2000)).optional(),
  phototype: z.number().int().min(1).max(6).nullish(),
  consentAccepted: z.boolean().optional(),
  signatureKey: z.string().min(3).max(200).optional(),
  signatureImageData: z.string().min(10).max(2_000_000).optional(), // base64 PNG ≤ ~1.5 MB raw
  status: z.enum(["draft", "submitted"]).optional()
});

export const medicalIntakeApproveSchema = z.object({
  approved: z.boolean(),
  rejectionReason: z.string().min(3).optional()
});
