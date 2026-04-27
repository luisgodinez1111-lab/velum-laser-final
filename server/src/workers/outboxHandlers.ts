/**
 * Registro centralizado de outbox handlers.
 *
 * Cada handler es responsable de un eventType. Convención de nombres:
 *   - "<aggregate>.<verb-past>" → "payment.succeeded", "appointment.canceled"
 *   - Un handler solo debe efectuar un side-effect externo (email, webhook,
 *     GCal sync, notification). NO debe re-emitir eventos al outbox dentro
 *     del mismo handler — eso lleva a loops difíciles de razonar.
 *
 * Idempotencia es responsabilidad del handler: el dispatcher puede
 * reintentar un evento varias veces antes de marcarlo done. Un handler
 * mal escrito puede mandar 3 emails para 1 evento.
 *
 * Estado actual (Fase 1.2.b): solo handler `audit.logged` para validar
 * el plumbing end-to-end sin riesgo (no toca consumers externos). Los
 * handlers reales (notification.email, gcal.sync, etc.) se añaden en
 * Fase 1.2.c migrando los crons existentes.
 */
import { logger } from "../utils/logger";
import { registerOutboxHandler } from "./outboxDispatcher";

export function registerAllOutboxHandlers(): void {
  // Smoke test: log + done. Ideal para el primer evento end-to-end.
  registerOutboxHandler("system.smoke_test", async (event) => {
    logger.info(
      { eventId: event.id, tenantId: event.tenantId, payload: event.payload },
      "[outbox-handler] system.smoke_test received",
    );
  });

  // TODO Fase 1.2.c: migrar handlers reales aquí.
  //   - notification.email      → enviar via Resend (cliente correcto por propósito)
  //   - appointment.reminder    → mandar recordatorio email + WhatsApp
  //   - payment.reminder        → mandar recordatorio de pago vencido
  //   - gcal.sync_required      → encolar en IntegrationJob para sync con Google Calendar
  //   - charge.expired          → notificar y marcar charge expirado
}
