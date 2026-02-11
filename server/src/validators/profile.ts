import { z } from "zod";

export const profileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().min(6).optional(),
  timezone: z.string().min(1).optional(),
  dateOfBirth: z.string().optional(),
  sex: z.string().max(1).optional(),
  address: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional()
});
