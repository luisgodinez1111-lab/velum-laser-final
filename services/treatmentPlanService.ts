import { apiFetch } from "./apiClient";

export interface TreatmentPlanData {
  id: string;
  userId: string;
  membershipId: string;
  zones: string[];
  totalSessions: number;
  completedSessions: number;
  status: "active" | "completed" | "paused" | "canceled";
  startDate: string;
  expectedEndDate?: string;
  notes?: string;
  user?: { profile?: { firstName?: string; lastName?: string } };
  membership?: { status: string; planId?: string };
  createdAt: string;
}

export const treatmentPlanService = {
  getMyPlans: () => apiFetch<TreatmentPlanData[]>("/me/treatment-plans"),

  create: (data: {
    userId: string;
    membershipId: string;
    zones: string[];
    totalSessions?: number;
    notes?: string;
  }) =>
    apiFetch<TreatmentPlanData>("/admin/treatment-plans", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<Pick<TreatmentPlanData, "status" | "notes" | "totalSessions" | "completedSessions">>) =>
    apiFetch<TreatmentPlanData>(`/admin/treatment-plans/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  incrementSession: (id: string) =>
    apiFetch<TreatmentPlanData>(`/admin/treatment-plans/${id}/increment`, {
      method: "POST",
    }),

  getAll: (filters?: { status?: string }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.set("status", filters.status);
    const qs = params.toString();
    return apiFetch<TreatmentPlanData[]>(`/admin/treatment-plans${qs ? `?${qs}` : ""}`);
  },

  getById: (id: string) => apiFetch<TreatmentPlanData>(`/admin/treatment-plans/${id}`),
};
