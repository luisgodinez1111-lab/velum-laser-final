import { Response } from "express";
import { prisma } from "../db/prisma";
import { AuthRequest } from "../middlewares/auth";

const buildPaymentWhere = (req: AuthRequest) => {
  const userId   = typeof req.query.userId   === "string" ? req.query.userId   : undefined;
  const status   = typeof req.query.status   === "string" ? req.query.status   : undefined;
  const dateFrom = typeof req.query.dateFrom === "string" ? new Date(req.query.dateFrom) : undefined;
  const dateTo   = typeof req.query.dateTo   === "string" ? new Date(req.query.dateTo)   : undefined;
  return {
    ...(userId ? { userId } : {}),
    ...(status ? { status: status as "pending" | "paid" | "failed" | "refunded" } : {}),
    ...(dateFrom || dateTo ? {
      createdAt: {
        ...(dateFrom ? { gte: dateFrom } : {}),
        ...(dateTo   ? { lte: dateTo   } : {})
      }
    } : {})
  };
};

export const getMyPayments = async (req: AuthRequest, res: Response) => {
  const payments = await prisma.payment.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: "desc" }
  });

  return res.json(payments);
};

export const listPaymentsAdmin = async (req: AuthRequest, res: Response) => {
  const page  = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(Math.max(1, Number(req.query.limit ?? 50)), 200);
  const where = buildPaymentWhere(req);

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

export const exportPaymentsCSV = async (req: AuthRequest, res: Response) => {
  const where = buildPaymentWhere(req);

  const payments = await prisma.payment.findMany({
    where,
    include: {
      user: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } }
    },
    orderBy: { createdAt: "desc" },
    take: 5000
  });

  const rows = [
    ["Fecha", "Nombre", "Email", "Monto (MXN)", "Divisa", "Estado", "Fecha de pago"],
    ...payments.map((p) => {
      const name = [p.user.profile?.firstName, p.user.profile?.lastName].filter(Boolean).join(" ") || "";
      const amount = p.amount != null ? (p.amount / 100).toFixed(2) : "";
      return [
        p.createdAt.toISOString().slice(0, 10),
        name,
        p.user.email,
        amount,
        p.currency?.toUpperCase() ?? "",
        p.status,
        p.paidAt ? p.paidAt.toISOString().slice(0, 10) : ""
      ];
    })
  ];

  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="pagos-${new Date().toISOString().slice(0,10)}.csv"`);
  return res.send("\ufeff" + csv); // BOM for Excel
};
