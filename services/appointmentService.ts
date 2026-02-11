import { apiFetch } from "./apiClient";

export interface AppointmentData {
  id: string;
  userId: string;
  type: "valuation" | "treatment" | "follow_up";
  status: "pending" | "confirmed" | "in_progress" | "completed" | "canceled" | "no_show";
  scheduledAt: string;
  durationMin: number;
  zones: string[];
  notes?: string;
  cancelReason?: string;
  staff?: { profile?: { firstName?: string; lastName?: string } };
  createdAt: string;
}

export interface TimeSlot {
  time: string;
  available: boolean;
}

export interface AvailabilityResponse {
  date: string;
  slots: TimeSlot[];
}

export const appointmentService = {
  getMyAppointments: () => apiFetch<AppointmentData[]>("/appointments"),

  getAvailability: (date: string) =>
    apiFetch<AvailabilityResponse>(`/schedule/availability?date=${date}`),

  book: (data: {
    scheduledAt: string;
    type?: "valuation" | "treatment" | "follow_up";
    zones?: string[];
    notes?: string;
  }) =>
    apiFetch<AppointmentData>("/appointments", {
      method: "POST",
      body: JSON.stringify(data)
    }),

  cancel: (id: string, reason?: string) =>
    apiFetch<AppointmentData>(`/appointments/${id}/cancel`, {
      method: "PATCH",
      body: JSON.stringify({ reason })
    })
};
