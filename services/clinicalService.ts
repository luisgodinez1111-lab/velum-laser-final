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
  status: "scheduled" | "confirmed" | "completed" | "canceled" | "no_show";
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

  createAppointment: async (payload: { startAt: string; endAt: string; reason?: string }) => {
    return apiFetch<Appointment>("/v1/appointments", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },

  listMyAppointments: async () => {
    return apiFetch<Appointment[]>("/v1/appointments");
  }
};
