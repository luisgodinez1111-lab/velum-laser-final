import { z } from "zod";

export const trackEventSchema = z.object({
  eventName: z.string().min(1),
  userId: z.string().optional(),
  leadId: z.string().optional(),
  fbp: z.string().optional(),
  fbc: z.string().optional(),
  sourceUrl: z.string().optional(),
  customData: z.record(z.unknown()).optional()
});
