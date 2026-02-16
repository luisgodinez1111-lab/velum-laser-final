import { Response } from "express";
import { prisma } from "../db/prisma";
import { AuthRequest } from "../middlewares/auth";

export const getMyPayments = async (req: AuthRequest, res: Response) => {
  const payments = await prisma.payment.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: "desc" }
  });

  return res.json(payments);
};

export const listPaymentsAdmin = async (req: AuthRequest, res: Response) => {
  const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;

  const payments = await prisma.payment.findMany({
    where: {
      ...(userId ? { userId } : {}),
      ...(status ? { status: status as "pending" | "paid" | "failed" | "refunded" } : {})
    },
    include: {
      user: {
        select: {
          id: true,
          email: true
        }
      },
      membership: {
        select: {
          id: true,
          status: true,
          planId: true
        }
      }
    },
    orderBy: { createdAt: "desc" },
    take: 500
  });

  return res.json(payments);
};
