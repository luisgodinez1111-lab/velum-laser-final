import { z } from "zod";

export const sessionCreateSchema = z.object({
  appointmentId: z.string().min(3).optional(),
  userId: z.string().min(3),
  laserParametersJson: z.record(z.unknown()).optional(),
  notes: z.string().min(1).optional(),
  adverseEvents: z.string().min(1).optional()
});

export const sessionFeedbackSchema = z.object({
  // memberFeedback: textarea libre. Opcional si el paciente solo manda chips.
  memberFeedback: z.string().min(3).optional(),
  // feedbackChips: ids de FEEDBACK_CHIPS (ver utils/sessionFeedback.ts).
  // La severidad se deriva server-side, no se confía en el cliente.
  feedbackChips: z.array(z.string().min(2).max(40)).max(10).optional(),
}).refine(
  (data) => Boolean(data.memberFeedback || (data.feedbackChips && data.feedbackChips.length > 0)),
  { message: "Debes enviar texto o seleccionar al menos un chip" }
);

/** Respuesta clínica del staff a un feedback de paciente (Fase B). */
export const sessionFeedbackResponseSchema = z.object({
  responseNote: z.string().min(3).max(2000),
});
