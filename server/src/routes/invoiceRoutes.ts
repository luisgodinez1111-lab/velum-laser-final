import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth";
import {
  createInvoice,
  getMyInvoices,
  getInvoiceDetail,
  listInvoices,
  getRevenueStats,
} from "../controllers/invoiceController";

export const invoiceRoutes = Router();

// Member: own invoices
invoiceRoutes.get("/me/invoices", requireAuth, getMyInvoices);

// Admin: manage invoices
invoiceRoutes.post("/admin/invoices", requireAuth, requireRole(["admin"]), createInvoice);
invoiceRoutes.get("/admin/invoices", requireAuth, requireRole(["staff", "admin"]), listInvoices);
invoiceRoutes.get("/admin/invoices/:id", requireAuth, requireRole(["staff", "admin"]), getInvoiceDetail);
invoiceRoutes.get("/admin/analytics/revenue", requireAuth, requireRole(["admin"]), getRevenueStats);
