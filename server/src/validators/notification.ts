import { z } from "zod";

export const createNotificationSchema = z.object({
  userId: z.string().min(1),
  type: z.enum(["in_app", "email", "whatsapp"]).default("in_app"),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  metadata: z.record(z.unknown()).optional()
});
