import { z } from "zod";

const scheduleConfigItemSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  slotDurationMin: z.number().int().min(15).max(240).default(60),
  maxSlots: z.number().int().min(1).max(50).default(10),
  isActive: z.boolean().default(true)
});

export const bulkScheduleSchema = z.array(scheduleConfigItemSchema).min(1).max(7);

export const blockDateSchema = z.object({
  date: z.string().datetime(),
  reason: z.string().optional()
});
