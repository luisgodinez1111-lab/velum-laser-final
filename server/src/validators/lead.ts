import { z } from "zod";

export const createLeadSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().min(6),
  source: z.enum(["website", "instagram", "facebook", "referral", "walk_in", "phone", "whatsapp", "other"]).default("website"),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmContent: z.string().optional(),
  utmTerm: z.string().optional(),
  referrerUrl: z.string().optional()
});

export const updateLeadSchema = z.object({
  status: z.enum(["new_lead", "contacted", "qualified", "converted", "lost"]).optional(),
  notes: z.string().optional(),
  assignedToUserId: z.string().optional()
});
