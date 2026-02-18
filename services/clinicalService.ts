import { apiFetch } from "./apiClient";

export type MedicalIntakeStatus = "draft" | "submitted" | "approved" | "rejected";

export interface MedicalIntake {
  id: string;
  userId: string;
  status: MedicalIntakeStatus;
  personalJson?: Record<string, unknown>;
  historyJson?: Record<string, unknown>;
  phototype?: number;
  consentAccepted: boolean;
}

export interface Appointment {
  id: string;
  userId: string;
  startAt: string;
  endAt: string;
  reason?: string;
  canceledAt?: string | null;
  canceledReason?: string | null;
  status: "scheduled" | "confirmed" | "completed" | "canceled" | "no_show";
  user?: {
    id: string;
    email: string;
  };
  createdBy?: {
    id: string;
    email: string;
    role: string;
  };
}

export interface AppointmentUpdatePayload {
  action: "reschedule" | "cancel";
  startAt?: string;
  endAt?: string;
  canceledReason?: string;
}

export const clinicalService = {
  getMyMedicalIntake: async (): Promise<MedicalIntake> => {
    return apiFetch<MedicalIntake>("/v1/medical-intakes/me");
  },

  updateMyMedicalIntake: async (payload: Partial<MedicalIntake> & { status?: "draft" | "submitted" }) => {
    return apiFetch<MedicalIntake>("/v1/medical-intakes/me", {
      method: "PUT",
      body: JSON.stringify(payload)
    });
  },

  createAppointment: async (payload: { startAt: string; endAt: string; reason?: string; userId?: string }) => {
    return apiFetch<Appointment>("/v1/appointments", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },

  listMyAppointments: async () => {
    return apiFetch<Appointment[]>("/v1/appointments");
  },

  listAppointments: async (params?: { userId?: string }) => {
    const query = params?.userId ? `?userId=${encodeURIComponent(params.userId)}` : "";
    return apiFetch<Appointment[]>(`/v1/appointments${query}`);
  },

  updateAppointment: async (appointmentId: string, payload: AppointmentUpdatePayload) => {
    return apiFetch<Appointment>(`/v1/appointments/${appointmentId}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
  }
};
