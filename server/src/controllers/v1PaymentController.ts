import { Response } from "express";
import { prisma } from "../db/prisma";
import { AuthRequest } from "../middlewares/auth";
import { parsePagination } from "../utils/pagination";

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
  const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>, { maxLimit: 100 });

  const where = { userId: req.user!.id };

  const [total, data] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
  ]);

  return res.json({ data, pagination: { page, limit, total } });
};

export const listPaymentsAdmin = async (req: AuthRequest, res: Response) => {
  const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>, { maxLimit: 200 });
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
      skip,
      take: limit
    })
  ]);

  return res.json({ payments, total, page, limit, pages: Math.ceil(total / limit) });
};

/**
 * Reconciliation report: detects common payment/membership mismatches.
 * Used by admins to spot anomalies without waiting for Stripe alerts.
 */
export const getPaymentReconciliationReport = async (req: AuthRequest, res: Response) => {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);

  const [
    activeMembershipsWithNoRecentPayment,
    paidPaymentsWithInactiveMembership,
    failedPaymentsLast30d,
    paymentsWithNoMembership,
  ] = await Promise.all([
    // Active memberships with no paid payment in the last 30 days (potential Stripe sync issue)
    prisma.membership.findMany({
      where: {
        status: "active",
        user: {
          payments: {
            none: { status: "paid", createdAt: { gte: thirtyDaysAgo } },
          },
        },
      },
      select: {
        id: true,
        userId: true,
        planCode: true,
        currentPeriodEnd: true,
        user: { select: { email: true } },
      },
      take: 50,
    }),
    // Paid payments whose associated membership is not active
    prisma.payment.findMany({
      where: {
        status: "paid",
        membership: { status: { not: "active" } },
        membershipId: { not: null },
      },
      select: {
        id: true,
        userId: true,
        amount: true,
        currency: true,
        paidAt: true,
        user: { select: { email: true } },
        membership: { select: { status: true } },
      },
      take: 50,
    }),
    // Payment failures in the last 30 days
    prisma.payment.count({
      where: { status: "failed", createdAt: { gte: thirtyDaysAgo } },
    }),
    // Paid payments with no linked membership
    prisma.payment.count({
      where: { status: "paid", membershipId: null, stripeSubscriptionId: { not: null } },
    }),
  ]);

  return res.json({
    generatedAt: now.toISOString(),
    summary: {
      activeMembershipsWithNoRecentPayment: activeMembershipsWithNoRecentPayment.length,
      paidPaymentsWithInactiveMembership: paidPaymentsWithInactiveMembership.length,
      failedPaymentsLast30d,
      paidPaymentsWithNoMembership: paymentsWithNoMembership,
    },
    details: {
      activeMembershipsWithNoRecentPayment,
      paidPaymentsWithInactiveMembership,
    },
  });
};

const csvEscape = (v: unknown): string => `"${String(v ?? "").replace(/"/g, '""')}"`;

export const exportPaymentsCSV = async (req: AuthRequest, res: Response) => {
  const where = buildPaymentWhere(req);
  const BATCH = 500;

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="pagos-${new Date().toISOString().slice(0,10)}.csv"`);
  // BOM for Excel
  res.write("\ufeff");
  res.write(["Fecha", "Nombre", "Email", "Monto (MXN)", "Divisa", "Estado", "Fecha de pago"].map(csvEscape).join(",") + "\n");

  let cursor: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const batch = await prisma.payment.findMany({
      where,
      include: {
        user: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    for (const p of batch) {
      const name = [p.user.profile?.firstName, p.user.profile?.lastName].filter(Boolean).join(" ") || "";
      const amount = p.amount != null ? (p.amount / 100).toFixed(2) : "";
      const row = [
        p.createdAt.toISOString().slice(0, 10),
        name,
        p.user.email,
        amount,
        p.currency?.toUpperCase() ?? "",
        p.status,
        p.paidAt ? p.paidAt.toISOString().slice(0, 10) : "",
      ].map(csvEscape).join(",");
      res.write(row + "\n");
    }

    if (batch.length < BATCH) {
      hasMore = false;
    } else {
      cursor = batch[batch.length - 1].id;
    }
  }

  return res.end();
};
