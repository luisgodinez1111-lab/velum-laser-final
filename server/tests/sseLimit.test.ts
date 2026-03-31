/**
 * Héctor Vidal — Tests SSE connection limit
 * Verifica: límite MAX_SSE_PER_USER=3, eviction del más antiguo,
 * cleanup correcto con unregisterSseClient, aislamiento entre usuarios.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.JWT_SECRET = "test-secret-32-bytes-minimum-len!!";
process.env.DATABASE_URL = "postgresql://x:x@localhost/x";
process.env.INTEGRATIONS_ENC_KEY = "test-integrations-key-32-bytes!!";

// Mock all heavy dependencies of notificationService
vi.mock("../src/db/prisma", () => ({
  prisma: { notification: { create: vi.fn(), findMany: vi.fn() } },
}));
vi.mock("../src/utils/env", () => ({
  env: {
    jwtSecret: "test-secret-32-bytes-minimum-len!!",
    stripeCheckoutBaseUrl: "",
    resendFromEmail: "noreply@test.com",
  },
  isProduction: false,
}));
vi.mock("../src/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../src/services/notificationEmailService", () => ({
  sendNotificationEmail:      vi.fn(),
  sendAdminNotificationEmail: vi.fn(),
}));
vi.mock("../src/services/emailService", () => ({
  sendAppointmentBookingEmail:      vi.fn(),
  sendAppointmentCancellationEmail: vi.fn(),
}));
vi.mock("../src/utils/appointmentToken", () => ({
  generateAppointmentConfirmToken: vi.fn().mockReturnValue("tok"),
}));

import { registerSseClient, unregisterSseClient } from "../src/services/notificationService";
import type { Response } from "express";

// Helper: crea una Response mock con .write(), .end(), .on()
const mockRes = (): Response => ({
  write: vi.fn(),
  end:   vi.fn(),
  on:    vi.fn(),
} as unknown as Response);

// Limpia el estado del módulo entre tests registrando y des-registrando
// (el mapa es estado de módulo compartido entre tests en el mismo worker)
const cleanupUser = (userId: string, responses: Response[]) => {
  for (const r of responses) unregisterSseClient(userId, r);
};

describe("registerSseClient — límite de conexiones", () => {
  it("acepta hasta 3 conexiones por usuario sin eviction", () => {
    const uid = "user-sse-1";
    const r1 = mockRes(), r2 = mockRes(), r3 = mockRes();

    registerSseClient(uid, r1);
    registerSseClient(uid, r2);
    registerSseClient(uid, r3);

    expect(r1.end).not.toHaveBeenCalled();
    expect(r2.end).not.toHaveBeenCalled();
    expect(r3.end).not.toHaveBeenCalled();

    cleanupUser(uid, [r1, r2, r3]);
  });

  it("evicta la conexión más antigua al agregar la 4ta (llama .end())", () => {
    const uid = "user-sse-2";
    const r1 = mockRes(), r2 = mockRes(), r3 = mockRes(), r4 = mockRes();

    registerSseClient(uid, r1);
    registerSseClient(uid, r2);
    registerSseClient(uid, r3);

    // r1 es la más antigua — debe ser evictada al llegar r4
    registerSseClient(uid, r4);

    expect(r1.end).toHaveBeenCalledOnce();
    expect(r2.end).not.toHaveBeenCalled();
    expect(r3.end).not.toHaveBeenCalled();
    expect(r4.end).not.toHaveBeenCalled();

    cleanupUser(uid, [r2, r3, r4]);
  });

  it("evicta correctamente en múltiples rounds (r2 al llegar r5)", () => {
    const uid = "user-sse-3";
    const r1 = mockRes(), r2 = mockRes(), r3 = mockRes(), r4 = mockRes(), r5 = mockRes();

    registerSseClient(uid, r1);
    registerSseClient(uid, r2);
    registerSseClient(uid, r3);
    registerSseClient(uid, r4); // evicta r1
    registerSseClient(uid, r5); // evicta r2

    expect(r1.end).toHaveBeenCalledOnce();
    expect(r2.end).toHaveBeenCalledOnce();
    expect(r3.end).not.toHaveBeenCalled();

    cleanupUser(uid, [r3, r4, r5]);
  });
});

describe("unregisterSseClient — limpieza", () => {
  it("elimina la response del registro sin afectar las demás", () => {
    const uid = "user-sse-4";
    const r1 = mockRes(), r2 = mockRes();

    registerSseClient(uid, r1);
    registerSseClient(uid, r2);
    unregisterSseClient(uid, r1);

    // r2 sigue activo — registrar r3 no dispara eviction
    const r3 = mockRes();
    registerSseClient(uid, r3);
    expect(r2.end).not.toHaveBeenCalled();

    cleanupUser(uid, [r2, r3]);
  });

  it("es idempotente — des-registrar dos veces no lanza error", () => {
    const uid = "user-sse-5";
    const r1 = mockRes();

    registerSseClient(uid, r1);
    expect(() => {
      unregisterSseClient(uid, r1);
      unregisterSseClient(uid, r1); // segunda vez — no-op
    }).not.toThrow();
  });

  it("no lanza error al des-registrar un userId inexistente", () => {
    const r = mockRes();
    expect(() => unregisterSseClient("user-never-existed", r)).not.toThrow();
  });
});

describe("aislamiento entre usuarios", () => {
  it("las conexiones de distintos usuarios no interfieren entre sí", () => {
    const uidA = "user-sse-A", uidB = "user-sse-B";
    const rA1 = mockRes(), rA2 = mockRes(), rA3 = mockRes(), rA4 = mockRes();
    const rB1 = mockRes(), rB2 = mockRes();

    // Usuario A llega al límite y desencadena eviction
    registerSseClient(uidA, rA1);
    registerSseClient(uidA, rA2);
    registerSseClient(uidA, rA3);
    registerSseClient(uidA, rA4); // evicta rA1

    // Usuario B con solo 2 conexiones — ninguna debe ser evictada
    registerSseClient(uidB, rB1);
    registerSseClient(uidB, rB2);

    expect(rA1.end).toHaveBeenCalledOnce(); // evictado
    expect(rB1.end).not.toHaveBeenCalled(); // intacto
    expect(rB2.end).not.toHaveBeenCalled(); // intacto

    cleanupUser(uidA, [rA2, rA3, rA4]);
    cleanupUser(uidB, [rB1, rB2]);
  });
});
