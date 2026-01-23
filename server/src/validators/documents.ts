import { z } from "zod";

export const documentUploadSchema = z.object({
  type: z.enum(["informed_consent", "privacy_notice", "medical_history", "other"]),
  version: z.string().min(1).optional()
});

export const documentSignSchema = z.object({
  signature: z.string().min(10)
});
