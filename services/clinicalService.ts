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
  cabinId?: string | null;
  startAt: string;
  endAt: string;
  reason?: string;
  canceledAt?: string | null;
  canceledReason?: string | null;
  confirmedAt?: string | null;
  completedAt?: string | null;
  noShowAt?: string | null;
  autoConfirmedAt?: string | null;
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
  cabin?: {
    id: string;
    name: string;
  };
}

export interface AppointmentUpdatePayload {
  action: "reschedule" | "cancel" | "confirm" | "complete" | "mark_no_show";
  cabinId?: string;
  startAt?: string;
  endAt?: string;
  canceledReason?: string;
}

export interface AgendaPolicy {
  id: string;
  timezone: string;
  slotMinutes: number;
  autoConfirmHours: number;
  noShowGraceMinutes: number;
}

export interface AgendaCabin {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

export interface AgendaWeeklyRule {
  id: string;
  dayOfWeek: number;
  isOpen: boolean;
  startHour: number;
  endHour: number;
}

export interface AgendaSpecialDateRule {
  id: string;
  dateKey: string;
  isOpen: boolean;
  startHour?: number | null;
  endHour?: number | null;
  note?: string | null;
}

export interface AgendaBlockedSlot {
  id: string;
  dateKey: string;
  startMinute: number;
  endMinute: number;
  reason?: string | null;
  cabinId?: string | null;
  createdByUserId?: string | null;
}

export interface AgendaConfig {
  policy: AgendaPolicy;
  cabins: AgendaCabin[];
  weeklyRules: AgendaWeeklyRule[];
  specialDateRules: AgendaSpecialDateRule[];
}

export interface AgendaSlotCabinRow {
  cabinId: string;
  cabinName: string;
  blocked: boolean;
  booked: number;
  capacity: number;
  available: number;
  appointmentIds: string[];
}

export interface AgendaSlot {
  key: string;
  startMinute: number;
  endMinute: number;
  label: string;
  blocked: boolean;
  booked: number;
  capacity: number;
  available: number;
  cabins: AgendaSlotCabinRow[];
}

export interface AgendaDailySummary {
  totalSlots: number;
  blockedSlots: number;
  totalCapacity: number;
  usedUnits: number;
  availableUnits: number;
  occupancy: number;
  appointmentsToday: number;
  canceledToday: number;
  noShowToday: number;
  completedToday: number;
}

export interface AgendaDailyCabinReport {
  cabinId: string;
  cabinName: string;
  blockedSlots: number;
  bookableSlots: number;
  scheduledOrConfirmed: number;
  completed: number;
  noShow: number;
  canceled: number;
  utilizationPct: number;
  productivityPct: number;
}

export interface AgendaDailyReport {
  dateKey: string;
  cabins: AgendaDailyCabinReport[];
  totals: {
    bookableSlots: number;
    blockedSlots: number;
    scheduledOrConfirmed: number;
    completed: number;
    noShow: number;
    canceled: number;
  };
  utilizationPct: number;
  productivityPct: number;
}

export interface AgendaDaySnapshot {
  dateKey: string;
  policy: AgendaPolicy;
  effectiveRule: {
    source: "weekly" | "special";
    dayOfWeek: number;
    isOpen: boolean;
    startHour?: number | null;
    endHour?: number | null;
  };
  cabins: AgendaCabin[];
  blocks: AgendaBlockedSlot[];
  slots: AgendaSlot[];
  appointments: Appointment[];
  summary: AgendaDailySummary;
  report: AgendaDailyReport;
}

export interface AgendaConfigUpdatePayload {
  timezone?: string;
  slotMinutes?: number;
  autoConfirmHours?: number;
  noShowGraceMinutes?: number;
  cabins?: Array<{
    id?: string;
    name: string;
    isActive?: boolean;
    sortOrder?: number;
  }>;
  weeklyRules?: Array<{
    dayOfWeek: number;
    isOpen: boolean;
    startHour?: number;
    endHour?: number;
  }>;
  specialDateRules?: Array<{
    dateKey: string;
    isOpen: boolean;
    startHour?: number | null;
    endHour?: number | null;
    note?: string | null;
  }>;
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

  createAppointment: async (payload: { startAt: string; endAt: string; reason?: string; userId?: string; cabinId?: string }) => {
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
  },

  getAdminAgendaConfig: async () => {
    return apiFetch<AgendaConfig>("/v1/agenda/admin/config");
  },

  updateAdminAgendaConfig: async (payload: AgendaConfigUpdatePayload) => {
    return apiFetch<AgendaConfig>("/v1/agenda/admin/config", {
      method: "PUT",
      body: JSON.stringify(payload)
    });
  },

  getAdminAgendaDay: async (dateKey: string) => {
    return apiFetch<AgendaDaySnapshot>(`/v1/agenda/admin/day/${encodeURIComponent(dateKey)}`);
  },

  getAdminAgendaReport: async (dateKey: string) => {
    return apiFetch<AgendaDailyReport>(`/v1/agenda/admin/report/${encodeURIComponent(dateKey)}`);
  },

  createAdminAgendaBlock: async (payload: {
    dateKey: string;
    startMinute: number;
    endMinute: number;
    reason?: string;
    cabinId?: string | null;
  }) => {
    return apiFetch<AgendaBlockedSlot>("/v1/agenda/admin/blocks", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },

  deleteAdminAgendaBlock: async (blockId: string) => {
    return apiFetch<void>(`/v1/agenda/admin/blocks/${encodeURIComponent(blockId)}`, {
      method: "DELETE"
    });
  }
};
