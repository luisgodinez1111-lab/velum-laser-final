import { Response } from "express";
import { prisma } from "../db/prisma";
import { AuthRequest } from "../middlewares/auth";

export const listWebhookEvents = async (_req: AuthRequest, res: Response) => {
  const events = await prisma.webhookEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      stripeEventId: true,
      type: true,
      processedAt: true,
      createdAt: true
    }
  });

  return res.json({ events });
};
