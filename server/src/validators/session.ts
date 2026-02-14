import { z } from "zod";

export const createSessionSchema = z.object({
  appointmentId: z.string().min(1),
  zones: z.array(z.string()).default([]),
  laserSettings: z.record(z.unknown()).default({}),
  skinResponse: z.string().optional(),
  fitzpatrickUsed: z.string().optional(),
  energyDelivered: z.string().optional(),
  notes: z.string().optional()
});

export const updateSessionSchema = z.object({
  zones: z.array(z.string()).optional(),
  laserSettings: z.record(z.unknown()).optional(),
  skinResponse: z.string().optional(),
  fitzpatrickUsed: z.string().optional(),
  energyDelivered: z.string().optional(),
  notes: z.string().optional()
});
