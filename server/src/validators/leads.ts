import { z } from "zod";

export const leadCreateSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(6),
  consent: z.literal(true),
  utm_source: z.string().min(1).optional(),
  utm_medium: z.string().min(1).optional(),
  utm_campaign: z.string().min(1).optional(),
  utm_term: z.string().min(1).optional(),
  utm_content: z.string().min(1).optional(),
  fbp: z.string().min(1).optional(),
  fbc: z.string().min(1).optional(),
  fbclid: z.string().min(1).optional()
});

export const marketingEventSchema = z.object({
  eventName: z.string().min(1),
  eventId: z.string().min(3),
  eventTime: z.string().datetime().optional(),
  userId: z.string().min(3).optional(),
  leadId: z.string().min(3).optional(),
  fbp: z.string().min(1).optional(),
  fbc: z.string().min(1).optional(),
  userData: z.record(z.unknown()).optional(),
  customData: z.record(z.unknown()).optional()
});
