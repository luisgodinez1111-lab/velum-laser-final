import { z } from "zod";

export const changePlanSchema = z.object({
  priceId: z.string().min(3)
});

export const membershipUpdateSchema = z.object({
  status: z.enum(["inactive", "active", "past_due", "canceled", "paused"])
});
