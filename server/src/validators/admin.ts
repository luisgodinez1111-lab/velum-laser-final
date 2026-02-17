import { z } from "zod";

export const roleUpdateSchema = z.object({
  role: z.enum(["member", "staff", "admin", "system"])
});
