import type { Prisma } from "@prisma/client";
import { getTenantId } from "./tenantContext";

export interface OutboxEventInput {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Prisma.InputJsonValue;
  tenantId?: string;
  availableAt?: Date;
  maxAttempts?: number;
}

/**
 * Escribe un evento de dominio dentro de la misma transaccion que el cambio
 * que lo origina. El caller debe pasar un `tx` de Prisma, no el cliente global,
 * cuando el evento deba ser atomico con una mutacion de negocio.
 */
export async function emitOutbox(
  tx: Prisma.TransactionClient,
  event: OutboxEventInput
): Promise<void> {
  const tenantId = event.tenantId ?? getTenantId();
  if (!tenantId) {
    throw new Error("emitOutbox: tenantId requerido");
  }

  await tx.outboxEvent.create({
    data: {
      tenantId,
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: event.payload,
      availableAt: event.availableAt,
      maxAttempts: event.maxAttempts
    }
  });
}
