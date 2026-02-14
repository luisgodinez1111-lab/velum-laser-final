import { apiFetch } from "./apiClient";

export interface InvoiceData {
  id: string;
  userId: string;
  stripeInvoiceId?: string;
  amount: number;
  currency: string;
  status: "pending" | "paid" | "failed" | "refunded";
  description?: string;
  periodStart?: string;
  periodEnd?: string;
  paidAt?: string;
  user?: { email: string; profile?: { firstName?: string; lastName?: string } };
  createdAt: string;
}

export interface RevenueStats {
  totalRevenue: number;
  totalInvoices: number;
  averageInvoice: number;
  byDay: Record<string, number>;
}

export const invoiceServiceFe = {
  getMyInvoices: () => apiFetch<InvoiceData[]>("/me/invoices"),

  getAll: (filters?: { status?: string; days?: number }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.set("status", filters.status);
    if (filters?.days) params.set("days", String(filters.days));
    const qs = params.toString();
    return apiFetch<InvoiceData[]>(`/admin/invoices${qs ? `?${qs}` : ""}`);
  },

  getRevenueStats: (days = 30) =>
    apiFetch<RevenueStats>(`/admin/analytics/revenue?days=${days}`),
};
