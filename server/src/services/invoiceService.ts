import { prisma } from "../db/prisma.js";
import type { InvoiceStatus } from "@prisma/client";

export const invoiceService = {
  async create(data: {
    userId: string;
    amount: number;
    currency?: string;
    description?: string;
    stripeInvoiceId?: string;
    stripePaymentIntentId?: string;
    periodStart?: Date;
    periodEnd?: Date;
    metadata?: Record<string, unknown>;
  }) {
    return prisma.invoice.create({
      data: {
        userId: data.userId,
        amount: data.amount,
        currency: data.currency || "mxn",
        description: data.description,
        stripeInvoiceId: data.stripeInvoiceId,
        stripePaymentIntentId: data.stripePaymentIntentId,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        metadata: data.metadata as any,
      },
      include: { user: { include: { profile: true } } },
    });
  },

  async getByUser(userId: string) {
    return prisma.invoice.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  },

  async getById(id: string) {
    return prisma.invoice.findUnique({
      where: { id },
      include: { user: { include: { profile: true } } },
    });
  },

  async updateStatus(id: string, status: InvoiceStatus, extra?: {
    paidAt?: Date;
    failedAt?: Date;
    refundedAt?: Date;
    stripePaymentIntentId?: string;
  }) {
    return prisma.invoice.update({
      where: { id },
      data: { status, ...extra },
    });
  },

  async findByStripeInvoiceId(stripeInvoiceId: string) {
    return prisma.invoice.findUnique({
      where: { stripeInvoiceId },
      include: { user: { include: { profile: true } } },
    });
  },

  async listAll(filters?: { status?: InvoiceStatus; days?: number }) {
    const where: any = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.days) {
      const since = new Date();
      since.setDate(since.getDate() - filters.days);
      where.createdAt = { gte: since };
    }

    return prisma.invoice.findMany({
      where,
      include: { user: { include: { profile: true } } },
      orderBy: { createdAt: "desc" },
    });
  },

  async getRevenueStats(days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const invoices = await prisma.invoice.findMany({
      where: { status: "paid", paidAt: { gte: since } },
    });

    const totalRevenue = invoices.reduce((sum, inv) => sum + inv.amount, 0);
    const byDay: Record<string, number> = {};
    for (const inv of invoices) {
      const day = (inv.paidAt || inv.createdAt).toISOString().split("T")[0];
      byDay[day] = (byDay[day] || 0) + inv.amount;
    }

    return {
      totalRevenue,
      totalInvoices: invoices.length,
      averageInvoice: invoices.length > 0 ? Math.round(totalRevenue / invoices.length) : 0,
      byDay,
    };
  },
};
