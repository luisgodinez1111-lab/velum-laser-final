import { apiFetch } from "./apiClient";

export interface OverviewData {
  totalUsers: number;
  totalLeads: number;
  totalAppointments: number;
  activeMembers: number;
  pendingIntakes: number;
}

export interface AppointmentStatsData {
  total: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  byDay: Record<string, number>;
}

export interface LeadStatsData {
  total: number;
  conversionRate: string;
  bySource: Record<string, number>;
  byStatus: Record<string, number>;
  byDay: Record<string, number>;
}

export interface SessionStatsData {
  totalSessions: number;
  byZone: Record<string, number>;
}

export const analyticsServiceFe = {
  getOverview: () => apiFetch<OverviewData>("/admin/analytics/overview"),

  getAppointmentStats: (days = 30) =>
    apiFetch<AppointmentStatsData>(`/admin/analytics/appointments?days=${days}`),

  getLeadStats: (days = 30) =>
    apiFetch<LeadStatsData>(`/admin/analytics/leads?days=${days}`),

  getSessionStats: (days = 30) =>
    apiFetch<SessionStatsData>(`/admin/analytics/sessions?days=${days}`)
};
