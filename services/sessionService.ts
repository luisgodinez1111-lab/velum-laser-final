import { apiFetch } from "./apiClient";

export interface SessionData {
  id: string;
  appointmentId: string;
  userId: string;
  staffUserId: string;
  zones: string[];
  laserSettings: Record<string, unknown>;
  skinResponse?: string;
  fitzpatrickUsed?: string;
  energyDelivered?: string;
  notes?: string;
  beforePhotoKey?: string;
  afterPhotoKey?: string;
  appointment?: { scheduledAt: string; type: string; status: string };
  staff?: { profile?: { firstName?: string; lastName?: string } };
  user?: { email: string; profile?: { firstName?: string; lastName?: string } };
  createdAt: string;
}

export const sessionService = {
  getMySessions: () => apiFetch<SessionData[]>("/me/sessions"),

  create: (data: {
    appointmentId: string;
    zones?: string[];
    laserSettings?: Record<string, unknown>;
    skinResponse?: string;
    fitzpatrickUsed?: string;
    energyDelivered?: string;
    notes?: string;
  }) =>
    apiFetch<SessionData>("/admin/sessions", {
      method: "POST",
      body: JSON.stringify(data)
    }),

  update: (id: string, data: Partial<Omit<SessionData, "id" | "appointmentId" | "userId" | "staffUserId" | "createdAt">>) =>
    apiFetch<SessionData>(`/admin/sessions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data)
    }),

  getAll: (filters?: { userId?: string; staffUserId?: string }) => {
    const params = new URLSearchParams();
    if (filters?.userId) params.set("userId", filters.userId);
    if (filters?.staffUserId) params.set("staffUserId", filters.staffUserId);
    const qs = params.toString();
    return apiFetch<SessionData[]>(`/admin/sessions${qs ? `?${qs}` : ""}`);
  }
};
