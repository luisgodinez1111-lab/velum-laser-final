/**
 * Intake AI Service — Movimiento #8.C
 *
 * Orquesta la generación de resúmenes clínicos:
 *   1. Carga el MedicalIntake del paciente + las últimas N sesiones
 *   2. Descifra signatureImageData y otros campos PHI cifrados (transparente)
 *   3. Pasa la data a aiProvider.summarizeIntake()
 *   4. Persiste un AuditLog del request — quién pidió qué, cuándo, qué tokens
 *
 * Aislamiento por tenant: el caller pasa por requireAuth → tenantContext
 * está activo, así que las queries Prisma respetan RLS cuando se active
 * (Fase 1.4.b). Por ahora, el filtro por tenant es responsabilidad del query.
 */
import { prisma } from "../db/prisma";
import { logger } from "../utils/logger";
import { getTenantContext } from "../utils/tenantContext";
import { createAuditLog } from "./auditService";
import { summarizeIntake, type IntakeSummaryResult } from "./aiProvider";
import { notFound } from "../utils/AppError";

const MAX_PREVIOUS_SESSIONS = 10;

/**
 * Genera un resumen clínico del paciente para que un staff member lo vea
 * al inicio de la sesión. Llama a Claude Sonnet con el expediente completo.
 *
 * @throws AppError NOT_FOUND si el paciente no tiene MedicalIntake.
 */
export async function summarizePatientForStaff(
  patientUserId: string,
  requestedByUserId: string,
): Promise<IntakeSummaryResult> {
  const ctx = getTenantContext();
  const tenantId = ctx?.tenantId ?? "default";

  // Cargar intake + sesiones recientes en paralelo.
  const [intake, sessions] = await Promise.all([
    prisma.medicalIntake.findUnique({
      where: { userId: patientUserId },
      select: {
        id: true,
        status: true,
        personalJson: true,
        historyJson: true,
        phototype: true,
        approvedAt: true,
        user: {
          select: {
            email: true,
            clinicId: true,
            profile: {
              select: { firstName: true, lastName: true, birthDate: true, phone: true },
            },
          },
        },
      },
    }),
    prisma.sessionTreatment.findMany({
      where: { userId: patientUserId },
      orderBy: { createdAt: "desc" },
      take: MAX_PREVIOUS_SESSIONS,
      select: {
        createdAt: true,
        notes: true,
        adverseEvents: true,
        appointment: { select: { treatment: { select: { name: true } } } },
      },
    }),
  ]);

  if (!intake) {
    throw notFound("Expediente médico no encontrado para este paciente");
  }

  // Verificación cross-tenant defensiva — además de RLS futuro.
  if (intake.user.clinicId !== tenantId) {
    logger.warn(
      { tenantId, intakeUserClinic: intake.user.clinicId, patientUserId },
      "[ai] cross-tenant access attempted — rejecting",
    );
    throw notFound("Expediente médico no encontrado");
  }

  // Componer datos personales — nombre/edad agregados al JSON original.
  // (Profile vive en tabla separada; Claude necesita el contexto unificado.)
  const personalData: Record<string, unknown> = {
    ...(intake.personalJson as Record<string, unknown> | null ?? {}),
    nombre: [intake.user.profile?.firstName, intake.user.profile?.lastName]
      .filter(Boolean).join(" ") || "no documentado",
    fecha_nacimiento: intake.user.profile?.birthDate?.toISOString().slice(0, 10) ?? "no documentada",
    fototipo: intake.phototype ?? "no documentado",
    estado_expediente: intake.status,
    aprobado_en: intake.approvedAt?.toISOString() ?? null,
  };

  const previousSessions = sessions.map((s) => ({
    date: s.createdAt.toISOString().slice(0, 10),
    treatment: s.appointment?.treatment?.name ?? undefined,
    notes: s.notes ?? undefined,
    adverseEvents: s.adverseEvents ?? undefined,
  }));

  const result = await summarizeIntake({
    userId: patientUserId,
    personalData,
    historyData: intake.historyJson as Record<string, unknown> | null,
    previousSessions,
  });

  // Auditoría — qué staff vio qué expediente vía IA, cuántos tokens, qué modelo.
  // Imprescindible para SOC 2 (acceso a PHI) y reporting de uso.
  await createAuditLog({
    actorUserId: requestedByUserId,
    targetUserId: patientUserId,
    action: "ai.intake.summary",
    resourceType: "MedicalIntake",
    resourceId: intake.id,
    result: "success",
    metadata: {
      model: result.model,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      cache_read_tokens: result.cacheReadTokens,
      cache_creation_tokens: result.cacheCreationTokens,
      previous_sessions_loaded: previousSessions.length,
    },
  }).catch((err) => {
    // La falla en audit NO debe bloquear el resumen — pero sí merece alerta.
    logger.error({ err, patientUserId, requestedByUserId }, "[ai] audit log failed");
  });

  return result;
}
