import { z } from "zod";

export const fileUploadMetaSchema = z.object({
  category: z.enum(["before_photo", "after_photo", "consent_doc", "intake_doc", "other"]).default("other"),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
});
