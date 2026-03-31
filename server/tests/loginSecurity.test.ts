/**
 * Tests para loginSecurityService — protección contra fuerza bruta.
 * Estrategia dual: fast-path en memoria + DB como fuente de verdad.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.JWT_SECRET = "test-secret-32-bytes-minimum-len";
process.env.DATABASE_URL = "postgresql://x:x@localhost/x";

// ── Mock Prisma ──────────────────────────────────────────────────────────────
const {
  mockFindUnique,
  mockUpdate,
  mockUpdateMany,
} = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockUpdate: vi.fn(),
  mockUpdateMany: vi.fn(),
}));

vi.mock("../src/db/prisma", () => ({
  prisma: {
    user: {
      findUnique: mockFindUnique,
      update: mockUpdate,
      updateMany: mockUpdateMany,
    },
  },
}));

import {
  isAccountLocked,
  recordLoginFailure,
  clearLoginFailures,
  _forceLoginLockout,
  LOGIN_MAX_FAILURES,
  LOGIN_LOCKOUT_MS,
} from "../src/services/loginSecurityService";

beforeEach(() => vi.clearAllMocks());

// ── isAccountLocked — fast-path en memoria ───────────────────────────────────

describe("isAccountLocked — fast-path en memoria", () => {
  it("retorna false cuando no hay lockout registrado", async () => {
    mockFindUnique.mockResolvedValue(null);
    const result = await isAccountLocked("noexiste@test.com");
    expect(result).toBe(false);
  });

  it("retorna true inmediatamente después de _forceLoginLockout", async () => {
    const email = "bloqueado@test.com";
    _forceLoginLockout(email);
    const result = await isAccountLocked(email);
    expect(result).toBe(true);
    // No debe consultar la DB gracias al fast-path
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("es case-insensitive: bloquear con mayúsculas, comprobar con minúsculas", async () => {
    const email = "CASE@TEST.COM";
    _forceLoginLockout(email);
    const result = await isAccountLocked("case@test.com");
    expect(result).toBe(true);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });
});

// ── isAccountLocked — path por DB ────────────────────────────────────────────

describe("isAccountLocked — path por DB", () => {
  it("retorna true cuando loginLockedUntil está en el futuro (DB)", async () => {
    const futuro = new Date(Date.now() + 5 * 60 * 1000); // +5 min
    mockFindUnique.mockResolvedValue({ loginLockedUntil: futuro });
    const result = await isAccountLocked("db-bloqueado@test.com");
    expect(result).toBe(true);
  });

  it("retorna false cuando loginLockedUntil es null (DB)", async () => {
    mockFindUnique.mockResolvedValue({ loginLockedUntil: null });
    mockUpdate.mockResolvedValue({});
    const result = await isAccountLocked("libre@test.com");
    expect(result).toBe(false);
  });

  it("retorna false cuando loginLockedUntil ya expiró (DB) y limpia el registro", async () => {
    const pasado = new Date(Date.now() - 60_000); // hace 1 min
    mockFindUnique.mockResolvedValue({ loginLockedUntil: pasado });
    mockUpdate.mockResolvedValue({});
    const result = await isAccountLocked("expirado@test.com");
    expect(result).toBe(false);
    // Debe haber llamado update para limpiar el lockout expirado
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { loginLockedUntil: null, loginFailedCount: 0 },
      })
    );
  });

  it("retorna false cuando la DB lanza un error (fail-open)", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB timeout"));
    const result = await isAccountLocked("error@test.com");
    expect(result).toBe(false);
  });
});

// ── recordLoginFailure ───────────────────────────────────────────────────────

describe("recordLoginFailure", () => {
  it("incrementa el contador en la DB", async () => {
    mockUpdate.mockResolvedValueOnce({ loginFailedCount: 1 });
    await recordLoginFailure("usuario@test.com");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { loginFailedCount: { increment: 1 } },
      })
    );
  });

  it("activa el lockout cuando se alcanza LOGIN_MAX_FAILURES", async () => {
    // Primer update (increment): devuelve el conteo en el límite
    mockUpdate
      .mockResolvedValueOnce({ loginFailedCount: LOGIN_MAX_FAILURES })
      .mockResolvedValueOnce({});

    await recordLoginFailure("limite@test.com");

    // Debe haber llamado update dos veces: increment + setLockedUntil
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    const segundaLlamada = mockUpdate.mock.calls[1][0];
    expect(segundaLlamada.data).toHaveProperty("loginLockedUntil");
    expect(segundaLlamada.data.loginLockedUntil).toBeInstanceOf(Date);
  });

  it("no activa lockout si el conteo no alcanza el límite", async () => {
    mockUpdate.mockResolvedValueOnce({ loginFailedCount: LOGIN_MAX_FAILURES - 1 });
    await recordLoginFailure("casi@test.com");
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it("no lanza si el usuario no existe (catch silencioso)", async () => {
    mockUpdate.mockRejectedValue(new Error("Record not found"));
    await expect(recordLoginFailure("fantasma@test.com")).resolves.toBeUndefined();
  });
});

// ── clearLoginFailures ───────────────────────────────────────────────────────

describe("clearLoginFailures", () => {
  it("limpia el fast-path en memoria y resetea la DB", async () => {
    const email = "reset@test.com";
    _forceLoginLockout(email);

    // Verificar que estaba bloqueado en memoria
    mockFindUnique.mockResolvedValue(null);
    expect(await isAccountLocked(email)).toBe(true);

    // Limpiar
    mockUpdateMany.mockResolvedValue({ count: 1 });
    await clearLoginFailures(email);

    // Ahora debe estar libre (sin consultar DB)
    mockFindUnique.mockResolvedValue(null);
    const result = await isAccountLocked(email);
    expect(result).toBe(false);
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { loginFailedCount: 0, loginLockedUntil: null },
      })
    );
  });

  it("no lanza si updateMany falla (catch silencioso)", async () => {
    mockUpdateMany.mockRejectedValue(new Error("DB error"));
    await expect(clearLoginFailures("error@test.com")).resolves.toBeUndefined();
  });
});

// ── Constantes exportadas ────────────────────────────────────────────────────

describe("Constantes de configuración", () => {
  it("LOGIN_MAX_FAILURES es un número positivo", () => {
    expect(LOGIN_MAX_FAILURES).toBeGreaterThan(0);
  });

  it("LOGIN_LOCKOUT_MS es al menos 1 minuto", () => {
    expect(LOGIN_LOCKOUT_MS).toBeGreaterThanOrEqual(60_000);
  });
});
