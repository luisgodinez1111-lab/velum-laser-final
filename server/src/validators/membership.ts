import { z } from "zod";

export const changePlanSchema = z.object({
  priceId: z.string().min(3)
});
