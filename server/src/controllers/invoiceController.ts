import type { Request, Response } from "express";
import { invoiceService } from "../services/invoiceService.js";
import { createInvoiceSchema } from "../validators/invoice.js";
import { createAuditLog } from "../services/auditService.js";

export const createInvoice = async (req: Request, res: Response) => {
  const parsed = createInvoiceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });

  const invoice = await invoiceService.create({
    ...parsed.data,
    periodStart: parsed.data.periodStart ? new Date(parsed.data.periodStart) : undefined,
    periodEnd: parsed.data.periodEnd ? new Date(parsed.data.periodEnd) : undefined,
  });

  await createAuditLog({ userId: req.user!.id, action: "invoice.create", metadata: { invoiceId: invoice.id, amount: parsed.data.amount } });
  res.status(201).json(invoice);
};

export const getMyInvoices = async (req: Request, res: Response) => {
  const invoices = await invoiceService.getByUser(req.user!.id);
  res.json(invoices);
};

export const getInvoiceDetail = async (req: Request, res: Response) => {
  const invoice = await invoiceService.getById(req.params.id);
  if (!invoice) return res.status(404).json({ message: "Factura no encontrada" });
  res.json(invoice);
};

export const listInvoices = async (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  const days = req.query.days ? parseInt(req.query.days as string) : undefined;
  const invoices = await invoiceService.listAll({ status: status as any, days });
  res.json(invoices);
};

export const getRevenueStats = async (req: Request, res: Response) => {
  const days = req.query.days ? parseInt(req.query.days as string) : 30;
  const stats = await invoiceService.getRevenueStats(days);
  res.json(stats);
};
