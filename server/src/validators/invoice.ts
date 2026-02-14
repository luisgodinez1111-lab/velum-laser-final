import { z } from "zod";

export const createInvoiceSchema = z.object({
  userId: z.string().min(1),
  amount: z.number().int().min(0),
  currency: z.string().default("mxn"),
  description: z.string().optional(),
  periodStart: z.string().datetime().optional(),
  periodEnd: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const updateInvoiceSchema = z.object({
  status: z.enum(["pending", "paid", "failed", "refunded"]).optional(),
  paidAt: z.string().datetime().optional(),
  stripePaymentIntentId: z.string().optional(),
});
