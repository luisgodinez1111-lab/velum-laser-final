/**
 * Feedback estructurado de sesiones — Fase 12 / B.1
 *
 * Definición canónica de los chips que el paciente puede seleccionar al
 * reportar reacción post-sesión. La severidad se DERIVA en server-side
 * (no se confía en lo que mande el cliente) para evitar manipulación.
 *
 * Cualquier chip con severidad >= "mild" marca `hasAdverseReaction = true`,
 * lo que dispara la notificación al equipo clínico (ver
 * notificationEventHandlers.ts → onSessionFeedbackReceived).
 *
 * Cuando el equipo clínico revise el chip set, puede pedir agregar/cambiar
 * chips. Mantener este archivo como único source of truth.
 */

export type FeedbackSeverity = "none" | "mild" | "moderate" | "severe";

export type FeedbackChip = {
  id: string;
  label: string;
  severity: FeedbackSeverity;
};

/** Catálogo canónico — paciente y admin lo consumen vía endpoint /v1/session-feedback/chips */
export const FEEDBACK_CHIPS: ReadonlyArray<FeedbackChip> = [
  { id: "ok",                label: "Todo bien",                severity: "none" },
  { id: "mild_redness",      label: "Enrojecimiento leve",      severity: "mild" },
  { id: "mild_burning",      label: "Ardor leve",               severity: "mild" },
  { id: "sensitivity",       label: "Sensibilidad",             severity: "mild" },
  { id: "welts",             label: "Ronchas",                  severity: "moderate" },
  { id: "color_change",      label: "Cambio de color en piel",  severity: "moderate" },
  { id: "severe_burning",    label: "Ardor severo",             severity: "severe" },
  { id: "blisters",          label: "Ampollas",                 severity: "severe" },
  { id: "bleeding",          label: "Sangrado",                 severity: "severe" },
  { id: "infection_signs",   label: "Señales de infección",     severity: "severe" },
  { id: "other",             label: "Algo más (detallar abajo)",severity: "none"   },
] as const;

const SEVERITY_RANK: Record<FeedbackSeverity, number> = {
  none: 0,
  mild: 1,
  moderate: 2,
  severe: 3,
};

/**
 * Deriva la severidad agregada de un set de chip ids.
 * Toma la más alta entre los chips seleccionados.
 * Si no hay chips o todos son "none", retorna "none".
 */
export function deriveFeedbackSeverity(chipIds: string[]): FeedbackSeverity {
  let max: FeedbackSeverity = "none";
  for (const id of chipIds) {
    const chip = FEEDBACK_CHIPS.find((c) => c.id === id);
    if (!chip) continue;
    if (SEVERITY_RANK[chip.severity] > SEVERITY_RANK[max]) {
      max = chip.severity;
    }
  }
  return max;
}

/** True si la severidad amerita notificación inmediata al equipo clínico. */
export function isAdverseReaction(severity: FeedbackSeverity): boolean {
  return severity !== "none";
}

/**
 * Genera un resumen humano del feedback para subjects de email
 * y notificaciones in-app del equipo.
 */
export function summarizeFeedback(chipIds: string[], severity: FeedbackSeverity): string {
  const labels = chipIds
    .map((id) => FEEDBACK_CHIPS.find((c) => c.id === id)?.label)
    .filter((l): l is string => Boolean(l));
  if (labels.length === 0) return "Feedback recibido";
  const severityLabel: Record<FeedbackSeverity, string> = {
    none: "rutinario",
    mild: "leve",
    moderate: "moderado",
    severe: "severo",
  };
  return `${labels.join(" · ")} (${severityLabel[severity]})`;
}
