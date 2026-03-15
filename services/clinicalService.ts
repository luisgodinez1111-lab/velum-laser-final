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
  signatureKey?: string | null;
}

export interface Appointment {
  id: string;
  userId: string;
  cabinId?: string | null;
  treatmentId?: string | null;
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
  treatment?: {
    id: string;
    name: string;
    code: string;
    durationMinutes: number;
    prepBufferMinutes?: number;
    cleanupBufferMinutes?: number;
  };
}

export interface AppointmentUpdatePayload {
  action: "reschedule" | "cancel" | "confirm" | "complete" | "mark_no_show";
  cabinId?: string;
  treatmentId?: string;
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
  maxActiveAppointmentsPerWeek: number;
  maxActiveAppointmentsPerMonth: number;
  minAdvanceMinutes: number;
  maxAdvanceDays: number;
}

export interface AgendaCabin {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

export interface AgendaTreatment {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  durationMinutes: number;
  prepBufferMinutes: number;
  cleanupBufferMinutes: number;
  cabinId?: string | null;
  allowedCabinIds?: string[];
  requiresSpecificCabin: boolean;
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
  treatments: AgendaTreatment[];
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
  maxActiveAppointmentsPerWeek?: number;
  maxActiveAppointmentsPerMonth?: number;
  minAdvanceMinutes?: number;
  maxAdvanceDays?: number;
  cabins?: Array<{
    id?: string;
    name: string;
    isActive?: boolean;
    sortOrder?: number;
  }>;
  treatments?: Array<{
    id?: string;
    name: string;
    code: string;
    description?: string | null;
    durationMinutes: number;
    prepBufferMinutes?: number;
    cleanupBufferMinutes?: number;
    cabinId?: string | null;
    allowedCabinIds?: string[];
    requiresSpecificCabin?: boolean;
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

export interface SessionTreatment {
  id: string;
  appointmentId?: string | null;
  userId: string;
  staffUserId: string;
  laserParametersJson?: Record<string, unknown> | null;
  notes?: string | null;
  adverseEvents?: string | null;
  memberFeedback?: string | null;
  feedbackAt?: string | null;
  createdAt: string;
  updatedAt: string;
  appointment?: Appointment | null;
  staffUser?: { id: string; email: string };
  user?: { id: string; email: string };
}

export interface SessionCreatePayload {
  appointmentId?: string;
  userId: string;
  laserParametersJson?: Record<string, unknown>;
  notes?: string;
  adverseEvents?: string;
}

export interface Payment {
  id: string;
  userId: string;
  membershipId?: string | null;
  stripeInvoiceId?: string | null;
  stripePaymentIntentId?: string | null;
  amount: number;
  currency: string;
  status: "pending" | "paid" | "failed" | "refunded";
  paidAt?: string | null;
  failedAt?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  createdAt: string;
  updatedAt: string;
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

  createAppointment: async (payload: { startAt: string; endAt: string; reason?: string; userId?: string; cabinId?: string; treatmentId?: string }) => {
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
  },

  createSession: async (payload: SessionCreatePayload): Promise<SessionTreatment> => {
    return apiFetch<SessionTreatment>("/v1/sessions", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },

  // ── Member-accessible agenda endpoints ────────────────────────────────
  getPublicAgendaPolicy: async (): Promise<{ minAdvanceMinutes: number; maxAdvanceDays: number; slotMinutes: number; timezone: string }> => {
    return apiFetch("/v1/agenda/public/policy");
  },

  getPublicAgendaSlots: async (dateKey: string): Promise<{
    dateKey: string;
    isOpen: boolean;
    slots: Array<{ label: string; startMinute: number; endMinute: number; available: boolean }>;
  }> => {
    return apiFetch(`/v1/agenda/public/slots/${encodeURIComponent(dateKey)}`);
  },

  getMySessions: async (): Promise<SessionTreatment[]> => {
    return apiFetch<SessionTreatment[]>("/v1/sessions/me");
  },

  getMemberSessions: async (userId: string): Promise<SessionTreatment[]> => {
    return apiFetch<SessionTreatment[]>(`/v1/sessions/me?userId=${encodeURIComponent(userId)}`);
  },

  getMedicalIntakeByUserId: async (userId: string): Promise<MedicalIntake> => {
    return apiFetch<MedicalIntake>(`/v1/medical-intakes/${userId}`);
  },

  approveMedicalIntake: async (userId: string, approved: boolean, rejectionReason?: string): Promise<MedicalIntake> => {
    return apiFetch<MedicalIntake>(`/v1/medical-intakes/${userId}/approve`, {
      method: "POST",
      body: JSON.stringify({ approved, ...(rejectionReason ? { rejectionReason } : {}) })
    });
  },

  addSessionFeedback: async (sessionId: string, memberFeedback: string): Promise<SessionTreatment> => {
    return apiFetch<SessionTreatment>(`/v1/sessions/${sessionId}/feedback`, {
      method: "PATCH",
      body: JSON.stringify({ memberFeedback })
    });
  },

  getMyPayments: async (): Promise<Payment[]> => {
    return apiFetch<Payment[]>("/v1/payments/me");
  }
};
