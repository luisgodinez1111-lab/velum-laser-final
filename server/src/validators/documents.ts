import { z } from "zod";

export const documentUploadSchema = z.object({
  type: z.string().min(3),
  contentType: z.string().min(3),
  size: z.number().int().positive().max(10 * 1024 * 1024),
  version: z.string().min(1).optional()
});
