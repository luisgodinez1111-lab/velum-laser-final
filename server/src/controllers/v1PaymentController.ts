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
  const dateFrom = typeof req.query.dateFrom === "string" ? new Date(req.query.dateFrom) : undefined;
  const dateTo = typeof req.query.dateTo === "string" ? new Date(req.query.dateTo) : undefined;
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(Math.max(1, Number(req.query.limit ?? 50)), 200);

  const where = {
    ...(userId ? { userId } : {}),
    ...(status ? { status: status as "pending" | "paid" | "failed" | "refunded" } : {}),
    ...(dateFrom || dateTo ? {
      createdAt: {
        ...(dateFrom ? { gte: dateFrom } : {}),
        ...(dateTo ? { lte: dateTo } : {})
      }
    } : {})
  };

  const [total, payments] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      include: {
        user: { select: { id: true, email: true } },
        membership: { select: { id: true, status: true, planId: true } }
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit
    })
  ]);

  return res.json({ payments, total, page, limit, pages: Math.ceil(total / limit) });
};
