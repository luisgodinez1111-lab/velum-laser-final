import { Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { withTenantContext } from "../db/withTenantContext";

export const listWebhookEvents = async (_req: AuthRequest, res: Response) => {
  const events = await withTenantContext(async (tx) => tx.webhookEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      stripeEventId: true,
      type: true,
      processedAt: true,
      createdAt: true
    }
  }));

  return res.json({ events });
};
