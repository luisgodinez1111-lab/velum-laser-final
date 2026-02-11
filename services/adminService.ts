import { apiFetch } from "./apiClient";

// Leads
export interface LeadData {
  id: string;
  firstName: string;
  lastName?: string;
  email?: string;
  phone: string;
  source: string;
  status: string;
  notes?: string;
  utmSource?: string;
  utmCampaign?: string;
  assignedTo?: { profile?: { firstName?: string; lastName?: string } };
  convertedUserId?: string;
  createdAt: string;
}

// Intakes
export interface IntakeAdminData {
  id: string;
  userId: string;
  status: string;
  fitzpatrickType?: string;
  questionnaire: Record<string, unknown>;
  contraindications: string[];
  signedAt?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  user: { email: string; profile?: { firstName?: string; lastName?: string } };
  reviewedBy?: { profile?: { firstName?: string; lastName?: string } };
  createdAt: string;
}

// Appointments
export interface AppointmentAdminData {
  id: string;
  userId: string;
  type: string;
  status: string;
  scheduledAt: string;
  durationMin: number;
  zones: string[];
  notes?: string;
  user: { email: string; profile?: { firstName?: string; lastName?: string } };
  staff?: { profile?: { firstName?: string; lastName?: string } };
  createdAt: string;
}

export const adminService = {
  // Leads
  getLeads: (filters?: { status?: string; source?: string; search?: string }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.set("status", filters.status);
    if (filters?.source) params.set("source", filters.source);
    if (filters?.search) params.set("search", filters.search);
    const qs = params.toString();
    return apiFetch<LeadData[]>(`/admin/leads${qs ? `?${qs}` : ""}`);
  },

  updateLead: (id: string, data: { status?: string; notes?: string; assignedToUserId?: string }) =>
    apiFetch<LeadData>(`/admin/leads/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data)
    }),

  convertLead: (id: string) =>
    apiFetch<{ lead: LeadData; message: string }>(`/admin/leads/${id}/convert`, {
      method: "POST"
    }),

  // Intakes
  getIntakes: (status?: string) => {
    const qs = status ? `?status=${status}` : "";
    return apiFetch<IntakeAdminData[]>(`/admin/intakes${qs}`);
  },

  getIntake: (id: string) =>
    apiFetch<IntakeAdminData>(`/admin/intakes/${id}`),

  reviewIntake: (id: string, decision: "approved" | "rejected", notes?: string) =>
    apiFetch<IntakeAdminData>(`/admin/intakes/${id}/review`, {
      method: "POST",
      body: JSON.stringify({ decision, notes })
    }),

  // Appointments
  getAppointments: (filters?: { status?: string; date?: string; staffUserId?: string }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.set("status", filters.status);
    if (filters?.date) params.set("date", filters.date);
    if (filters?.staffUserId) params.set("staffUserId", filters.staffUserId);
    const qs = params.toString();
    return apiFetch<AppointmentAdminData[]>(`/admin/appointments${qs ? `?${qs}` : ""}`);
  },

  updateAppointment: (id: string, data: { status?: string; staffUserId?: string; notes?: string }) =>
    apiFetch<AppointmentAdminData>(`/admin/appointments/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data)
    })
};
