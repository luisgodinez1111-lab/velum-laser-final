/**
 * appointmentEligibilityService.ts — Reglas de elegibilidad para agendar citas.
 *
 * Extraído de v1AppointmentController para que sea testeable de forma aislada.
 * Responsabilidades:
 *   - Verificar elegibilidad clínica del paciente (expediente + membresía)
 *   - Resolver el tratamiento asociado a una cita
 *   - Calcular las cabinas preferidas para un tratamiento
 *   - Derivar el endAt de una cita a partir del tratamiento o del payload
 */
import { prisma } from "../db/prisma";
import { AgendaValidationError } from "./agendaService";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type ResolvedAgendaTreatment = {
  id: string;
  code: string;
  durationMinutes: number;
  prepBufferMinutes: number;
  cleanupBufferMinutes: number;
  cabinId: string | null;
  requiresSpecificCabin: boolean;
  isActive: boolean;
  cabinRules: Array<{ cabinId: string; priority: number }>;
};

// ── Elegibilidad clínica ──────────────────────────────────────────────────────

/**
 * Verifica si un paciente tiene expediente y membresía en estado válido para agendar.
 * Los roles privilegiados (staff, admin, system) siempre son elegibles.
 */
export const hasClinicalEligibility = async (userId: string) => {
  const [intake, membership] = await Promise.all([
    prisma.medicalIntake.findUnique({
      where: { userId },
      select: { status: true },
    }),
    prisma.membership.findUnique({
      where: { userId },
      select: { status: true },
    }),
  ]);

  return {
    intakeOk: Boolean(intake && ["submitted", "approved"].includes(intake.status)),
    membershipOk: membership?.status === "active",
  };
};

// ── Resolución de tratamiento ─────────────────────────────────────────────────

/**
 * Resuelve el tratamiento para una cita. Busca por ID directo o por código (reason).
 * Lanza AgendaValidationError si el tratamiento no existe o está inactivo.
 */
export const resolveTreatmentForAppointment = async (args: {
  treatmentId?: string;
  reason?: string;
}): Promise<ResolvedAgendaTreatment | null> => {
  const TREATMENT_SELECT = {
    id: true,
    code: true,
    durationMinutes: true,
    prepBufferMinutes: true,
    cleanupBufferMinutes: true,
    cabinId: true,
    requiresSpecificCabin: true,
    isActive: true,
    cabinRules: {
      select: { cabinId: true, priority: true },
      orderBy: [{ priority: "asc" as const }, { createdAt: "asc" as const }],
    },
  };

  if (args.treatmentId) {
    const treatment = await prisma.agendaTreatment.findUnique({
      where: { id: args.treatmentId },
      select: TREATMENT_SELECT,
    });
    if (!treatment || !treatment.isActive) {
      throw new AgendaValidationError("El tratamiento indicado no existe o está inactivo", 404);
    }
    return treatment as ResolvedAgendaTreatment;
  }

  const code = args.reason?.trim().toLowerCase();
  if (!code) return null;

  const treatment = await prisma.agendaTreatment.findFirst({
    where: { code, isActive: true },
    select: TREATMENT_SELECT,
  });

  return (treatment as ResolvedAgendaTreatment | null) ?? null;
};

// ── Preferencia de cabinas ────────────────────────────────────────────────────

/**
 * Devuelve los IDs de cabinas en orden de preferencia para un tratamiento dado.
 * Respeta el orden de prioridad definido en las reglas del tratamiento.
 */
export const preferredCabinIdsForTreatment = (
  treatment: ResolvedAgendaTreatment | null
): string[] => {
  if (!treatment) return [];

  const ordered = treatment.cabinRules
    .slice()
    .sort((a, b) => a.priority - b.priority)
    .map((rule) => rule.cabinId);

  if (treatment.cabinId && !ordered.includes(treatment.cabinId)) {
    ordered.unshift(treatment.cabinId);
  }

  return Array.from(new Set(ordered));
};

// ── Derivación de endAt ───────────────────────────────────────────────────────

/**
 * Calcula el endAt de la cita. Prioriza la duración del tratamiento; si no hay
 * tratamiento, usa el payloadEndAt; si ninguno, retorna null.
 */
export const deriveAppointmentEndAt = ({
  startAt,
  payloadEndAt,
  treatment,
}: {
  startAt: Date;
  payloadEndAt?: string;
  treatment: ResolvedAgendaTreatment | null;
}): Date | null => {
  if (treatment) {
    return new Date(startAt.getTime() + treatment.durationMinutes * 60 * 1000);
  }
  if (!payloadEndAt) return null;
  return new Date(payloadEndAt);
};
