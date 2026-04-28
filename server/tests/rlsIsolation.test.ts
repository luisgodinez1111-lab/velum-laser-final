/**
 * Test de aislamiento entre tenants — Fase 1.4.b
 *
 * Garantía: cuando se active RLS_ENFORCE=true (vía withTenantContext en
 * los callers), un tenant JAMÁS ve datos de otro. Este test es la red
 * de seguridad — corre en CI contra postgres real con la migración 0.4
 * + 1.4.a aplicadas.
 *
 * Estructura:
 *   1. Crea dos tenants (default + isolation-test)
 *   2. Cada uno con un User propio
 *   3. Verifica que con `app.tenant_id = X` solo se ven datos de X
 *   4. Verifica fallback permisivo (sin contexto = ve todo) — preservado
 *      hasta que RLS_ENFORCE bloquee el caso "sin contexto"
 *   5. Cleanup completo (no deja basura entre runs)
 *
 * Por qué este test existe:
 *   - 37 callers en server/src tocan User/Appointment/etc. directamente.
 *   - Refactorearlos a withTenantContext es trabajo masivo (Fase 2).
 *   - Mientras tanto, este test garantiza que las POLICIES están bien.
 *     Si alguien cambia el SQL de la migración o la deshabilita, este
 *     test rompe en CI.
 *
 * Test corre solo si DATABASE_URL está disponible — se skip en CI sin DB.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

// Cliente directo a Postgres como `postgres` (superuser) para setup/cleanup.
// El test usa $queryRawUnsafe para evitar parametrización en SQL DDL.
//
// Importante: tests/setup.ts forza DATABASE_URL a un valor fake para que los
// tests unitarios no toquen DB real. Para correr estos tests de RLS contra
// postgres, el operador debe setear RLS_TEST_DATABASE_URL=postgresql://postgres:...
// La ausencia de esa variable hace que TODO el describe se skipee.
const RLS_DB_URL = process.env.RLS_TEST_DATABASE_URL;
const prismaSuper = RLS_DB_URL
  ? new PrismaClient({ datasources: { db: { url: RLS_DB_URL } } })
  : (null as unknown as PrismaClient);

const TENANT_A = "rls_test_a";
const TENANT_B = "rls_test_b";
const USER_A = "rls_user_a";
const USER_B = "rls_user_b";

// Skip si: no hay DB, o el setup de Fase 1.4.a (rol velumapp + FORCE RLS) no está
// presente. Evita falsos positivos en CI básico antes de que el workflow lo prepare.
let setupReady = false;

describe.skipIf(!RLS_DB_URL)("RLS tenant isolation", () => {
  beforeAll(async () => {
    // Detectar si el entorno tiene el setup completo de Fase 1.4.a.
    try {
      const roleCheck = await prismaSuper.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'velumapp') AS exists
      `;
      const policyCheck = await prismaSuper.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) AS count FROM pg_policies WHERE tablename = 'User' AND policyname = 'tenant_isolation'
      `;
      setupReady = roleCheck[0]?.exists === true && Number(policyCheck[0]?.count ?? 0) > 0;
    } catch {
      setupReady = false;
    }
    if (!setupReady) return;

    // Crear dos tenants y un user en cada uno. Como `postgres` (superuser)
    // bypasseamos RLS para el setup — es exactamente lo que queremos.
    await prismaSuper.$executeRaw`
      INSERT INTO "Tenant" (id, slug, "legalName", "displayName", status, "planTier", region, "createdAt", "updatedAt")
      VALUES (${TENANT_A}, ${`slug-${TENANT_A}`}, 'Tenant A', 'A', 'active', 'starter', 'mx', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `;
    await prismaSuper.$executeRaw`
      INSERT INTO "Tenant" (id, slug, "legalName", "displayName", status, "planTier", region, "createdAt", "updatedAt")
      VALUES (${TENANT_B}, ${`slug-${TENANT_B}`}, 'Tenant B', 'B', 'active', 'starter', 'mx', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `;
    await prismaSuper.$executeRaw`
      INSERT INTO "User" (id, email, "passwordHash", role, "clinicId", "updatedAt")
      VALUES (${USER_A}, ${`${USER_A}@test.local`}, 'hash', 'member', ${TENANT_A}, NOW())
      ON CONFLICT (id) DO NOTHING
    `;
    await prismaSuper.$executeRaw`
      INSERT INTO "User" (id, email, "passwordHash", role, "clinicId", "updatedAt")
      VALUES (${USER_B}, ${`${USER_B}@test.local`}, 'hash', 'member', ${TENANT_B}, NOW())
      ON CONFLICT (id) DO NOTHING
    `;
  });

  afterAll(async () => {
    if (setupReady) {
      await prismaSuper.$executeRaw`DELETE FROM "User"   WHERE id IN (${USER_A}, ${USER_B})`;
      await prismaSuper.$executeRaw`DELETE FROM "Tenant" WHERE id IN (${TENANT_A}, ${TENANT_B})`;
    }
    await prismaSuper.$disconnect();
  });

  // Cada test hace early return si el entorno no tiene el setup. El log de
  // skipped explica por qué — útil para que el operador sepa qué falta.
  function requireSetup(): boolean {
    if (!setupReady) {
      // eslint-disable-next-line no-console
      console.warn("[rls-isolation] skip — falta rol velumapp y/o policy tenant_isolation");
      return false;
    }
    return true;
  }

  /**
   * Helper que ejecuta `fn` con un rol no-superuser (para que RLS aplique)
   * y un app.tenant_id seteado. Implementado como tx con SET LOCAL ROLE
   * + set_config — el patrón que la app real usará vía withTenantContext.
   */
  async function asTenant<T>(tenantId: string | null, fn: () => Promise<T>): Promise<T> {
    return prismaSuper.$transaction(async (tx) => {
      // Cambiar a velumapp (no-superuser, no-bypassrls — owner pero con FORCE)
      await tx.$executeRawUnsafe(`SET LOCAL ROLE velumapp`);
      if (tenantId === null) {
        await tx.$executeRawUnsafe(`SELECT set_config('app.tenant_id', '', true)`);
      } else {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      }
      // El callback recibe el mismo tx implícitamente vía closure.
      // Para queries simples lo hacemos via $queryRaw aquí mismo:
      return fn();
    }) as T;
  }

  it("tenant A SOLO ve sus propios users (no los de B)", async () => {
    const rows = await prismaSuper.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE velumapp`);
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${TENANT_A}, true)`;
      return tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "User" WHERE id IN (${USER_A}, ${USER_B})`;
    });
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(USER_A);
    expect(ids).not.toContain(USER_B);
  });

  it("tenant B SOLO ve sus propios users (no los de A)", async () => {
    const rows = await prismaSuper.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE velumapp`);
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${TENANT_B}, true)`;
      return tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "User" WHERE id IN (${USER_A}, ${USER_B})`;
    });
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(USER_B);
    expect(ids).not.toContain(USER_A);
  });

  it("tenant inexistente ve 0 users (de los de prueba)", async () => {
    const rows = await prismaSuper.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE velumapp`);
      await tx.$executeRaw`SELECT set_config('app.tenant_id', 'no-existe', true)`;
      return tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "User" WHERE id IN (${USER_A}, ${USER_B})`;
    });
    expect(rows).toHaveLength(0);
  });

  it("sin contexto (fallback permisivo): ve TODOS los users de prueba — comportamiento Fase 1.4.a", async () => {
    // Importante: este caso es lo que la app hace HOY (no setea app.tenant_id).
    // El fallback `IS NULL OR ...` permite todo. Cuando RLS_ENFORCE=true se
    // active y todos los callers usen withTenantContext, este test debe
    // actualizarse para esperar 0 (o eliminarse).
    const rows = await prismaSuper.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE velumapp`);
      // NO seteamos app.tenant_id — simula caller sin tenantContext
      return tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "User" WHERE id IN (${USER_A}, ${USER_B})`;
    });
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(USER_A);
    expect(ids).toContain(USER_B);
  });

  it("INSERT cross-tenant rechazado por WITH CHECK", async () => {
    // Intento del tenant A crear un user que diga ser de tenant B.
    // La policy WITH CHECK debe rechazarlo.
    let rejected = false;
    try {
      await prismaSuper.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE velumapp`);
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${TENANT_A}, true)`;
        await tx.$executeRaw`
          INSERT INTO "User" (id, email, "passwordHash", role, "clinicId", "updatedAt")
          VALUES ('rls_evil', 'evil@test.local', 'h', 'member', ${TENANT_B}, NOW())
        `;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Postgres lanza "new row violates row-level security policy"
      if (/row-level security/i.test(msg) || /violates/i.test(msg)) {
        rejected = true;
      }
    }
    expect(rejected).toBe(true);

    // Verificar que la fila NO se insertó (rollback automático del intento).
    const exists = await prismaSuper.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "User" WHERE id = 'rls_evil'
    `;
    expect(exists).toHaveLength(0);
  });

  // ── Fase 1.5 Slice A — tablas hijas con datos clínicos/financieros ───
  //
  // Para cada tabla hija con tenantId, verificamos que:
  //   1. Tenant A NO ve filas con tenantId=B (SELECT filtra)
  //   2. INSERT con tenantId mismatch es rechazado (WITH CHECK)
  //
  // El setup crea una fila en cada tabla bajo TENANT_A y otra bajo
  // TENANT_B. Insertamos como `postgres` (superuser bypasa RLS) para no
  // pelearnos con WITH CHECK durante el setup.
  describe("Slice A — tablas hijas (Membership, Payment, Document, MedicalIntake, SessionTreatment, CustomCharge, Notification, AuditLog)", () => {
    const ROW_A = "rls_row_a";
    const ROW_B = "rls_row_b";

    type ChildTable = {
      name: string;
      // SQL para insertar la fila A (tenantId=TENANT_A, userId=USER_A si aplica).
      insertA: string;
      // SQL para insertar la fila B (tenantId=TENANT_B, userId=USER_B si aplica).
      insertB: string;
      // SQL para limpiar (DELETE).
      cleanup: string;
    };

    const tables: ChildTable[] = [
      {
        name: "Membership",
        insertA: `INSERT INTO "Membership" (id, "tenantId", "userId", status, "updatedAt") VALUES ('${ROW_A}', '${TENANT_A}', '${USER_A}', 'inactive', NOW())`,
        insertB: `INSERT INTO "Membership" (id, "tenantId", "userId", status, "updatedAt") VALUES ('${ROW_B}', '${TENANT_B}', '${USER_B}', 'inactive', NOW())`,
        cleanup: `DELETE FROM "Membership" WHERE id IN ('${ROW_A}','${ROW_B}')`,
      },
      {
        name: "Payment",
        insertA: `INSERT INTO "Payment" (id, "tenantId", "userId", status, "updatedAt") VALUES ('${ROW_A}', '${TENANT_A}', '${USER_A}', 'pending', NOW())`,
        insertB: `INSERT INTO "Payment" (id, "tenantId", "userId", status, "updatedAt") VALUES ('${ROW_B}', '${TENANT_B}', '${USER_B}', 'pending', NOW())`,
        cleanup: `DELETE FROM "Payment" WHERE id IN ('${ROW_A}','${ROW_B}')`,
      },
      {
        name: "Document",
        insertA: `INSERT INTO "Document" (id, "tenantId", "userId", type, status, "updatedAt") VALUES ('${ROW_A}', '${TENANT_A}', '${USER_A}', 'consent', 'pending', NOW())`,
        insertB: `INSERT INTO "Document" (id, "tenantId", "userId", type, status, "updatedAt") VALUES ('${ROW_B}', '${TENANT_B}', '${USER_B}', 'consent', 'pending', NOW())`,
        cleanup: `DELETE FROM "Document" WHERE id IN ('${ROW_A}','${ROW_B}')`,
      },
      {
        name: "MedicalIntake",
        insertA: `INSERT INTO "MedicalIntake" (id, "tenantId", "userId", status, "updatedAt") VALUES ('${ROW_A}', '${TENANT_A}', '${USER_A}', 'draft', NOW())`,
        insertB: `INSERT INTO "MedicalIntake" (id, "tenantId", "userId", status, "updatedAt") VALUES ('${ROW_B}', '${TENANT_B}', '${USER_B}', 'draft', NOW())`,
        cleanup: `DELETE FROM "MedicalIntake" WHERE id IN ('${ROW_A}','${ROW_B}')`,
      },
      {
        name: "SessionTreatment",
        insertA: `INSERT INTO "SessionTreatment" (id, "tenantId", "userId", "staffUserId", "updatedAt") VALUES ('${ROW_A}', '${TENANT_A}', '${USER_A}', '${USER_A}', NOW())`,
        insertB: `INSERT INTO "SessionTreatment" (id, "tenantId", "userId", "staffUserId", "updatedAt") VALUES ('${ROW_B}', '${TENANT_B}', '${USER_B}', '${USER_B}', NOW())`,
        cleanup: `DELETE FROM "SessionTreatment" WHERE id IN ('${ROW_A}','${ROW_B}')`,
      },
      {
        name: "CustomCharge",
        insertA: `INSERT INTO "CustomCharge" (id, "tenantId", "userId", title, amount, status, "updatedAt") VALUES ('${ROW_A}', '${TENANT_A}', '${USER_A}', 'test', 100, 'PENDING_ACCEPTANCE', NOW())`,
        insertB: `INSERT INTO "CustomCharge" (id, "tenantId", "userId", title, amount, status, "updatedAt") VALUES ('${ROW_B}', '${TENANT_B}', '${USER_B}', 'test', 100, 'PENDING_ACCEPTANCE', NOW())`,
        cleanup: `DELETE FROM "CustomCharge" WHERE id IN ('${ROW_A}','${ROW_B}')`,
      },
      {
        name: "Notification",
        insertA: `INSERT INTO "Notification" (id, "tenantId", "userId", type, title) VALUES ('${ROW_A}', '${TENANT_A}', '${USER_A}', 'test', 'A')`,
        insertB: `INSERT INTO "Notification" (id, "tenantId", "userId", type, title) VALUES ('${ROW_B}', '${TENANT_B}', '${USER_B}', 'test', 'B')`,
        cleanup: `DELETE FROM "Notification" WHERE id IN ('${ROW_A}','${ROW_B}')`,
      },
      {
        name: "AuditLog",
        insertA: `INSERT INTO "AuditLog" (id, "tenantId", "userId", action) VALUES ('${ROW_A}', '${TENANT_A}', '${USER_A}', 'test')`,
        insertB: `INSERT INTO "AuditLog" (id, "tenantId", "userId", action) VALUES ('${ROW_B}', '${TENANT_B}', '${USER_B}', 'test')`,
        cleanup: `DELETE FROM "AuditLog" WHERE id IN ('${ROW_A}','${ROW_B}')`,
      },
    ];

    beforeAll(async () => {
      if (!setupReady) return;
      for (const t of tables) {
        await prismaSuper.$executeRawUnsafe(t.cleanup); // safety
        await prismaSuper.$executeRawUnsafe(t.insertA);
        await prismaSuper.$executeRawUnsafe(t.insertB);
      }
    });

    afterAll(async () => {
      if (!setupReady) return;
      for (const t of tables) {
        await prismaSuper.$executeRawUnsafe(t.cleanup);
      }
    });

    for (const t of tables) {
      it(`${t.name}: tenant A NO ve filas de B`, async () => {
        if (!requireSetup()) return;
        const rows = await prismaSuper.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL ROLE velumapp`);
          await tx.$executeRaw`SELECT set_config('app.tenant_id', ${TENANT_A}, true)`;
          return tx.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT id FROM "${t.name}" WHERE id IN ('${ROW_A}','${ROW_B}')`,
          );
        });
        const ids = rows.map((r) => r.id);
        expect(ids).toContain(ROW_A);
        expect(ids).not.toContain(ROW_B);
      });

      it(`${t.name}: tenant B NO ve filas de A`, async () => {
        if (!requireSetup()) return;
        const rows = await prismaSuper.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL ROLE velumapp`);
          await tx.$executeRaw`SELECT set_config('app.tenant_id', ${TENANT_B}, true)`;
          return tx.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT id FROM "${t.name}" WHERE id IN ('${ROW_A}','${ROW_B}')`,
          );
        });
        const ids = rows.map((r) => r.id);
        expect(ids).toContain(ROW_B);
        expect(ids).not.toContain(ROW_A);
      });
    }
  });

  // ── Fase 1.5 Slice B — tablas de auth/identity (PII) ─────────────────
  //
  // Cobertura idéntica a Slice A pero para Profile + tokens/OTPs:
  //   Profile, RefreshToken, EmailVerificationToken, PasswordResetToken,
  //   ConsentOtpToken, PasswordHistory, WhatsappOtp, DeleteOtp.
  describe("Slice B — auth/identity (Profile, RefreshToken, EmailVerificationToken, PasswordResetToken, ConsentOtpToken, PasswordHistory, WhatsappOtp, DeleteOtp)", () => {
    const ROW_A = "rls_authrow_a";
    const ROW_B = "rls_authrow_b";

    type ChildTable = {
      name: string;
      insertA: string;
      insertB: string;
      cleanup: string;
    };

    const tables: ChildTable[] = [
      {
        name: "Profile",
        insertA: `INSERT INTO "Profile" (id, "tenantId", "userId", "updatedAt") VALUES ('${ROW_A}', '${TENANT_A}', '${USER_A}', NOW()) ON CONFLICT DO NOTHING`,
        insertB: `INSERT INTO "Profile" (id, "tenantId", "userId", "updatedAt") VALUES ('${ROW_B}', '${TENANT_B}', '${USER_B}', NOW()) ON CONFLICT DO NOTHING`,
        cleanup: `DELETE FROM "Profile" WHERE id IN ('${ROW_A}','${ROW_B}')`,
      },
      {
        name: "RefreshToken",
        insertA: `INSERT INTO "RefreshToken" (id, "tenantId", "userId", "tokenHash", "expiresAt") VALUES ('${ROW_A}', '${TENANT_A}', '${USER_A}', 'hash_a', NOW() + INTERVAL '1 day')`,
        insertB: `INSERT INTO "RefreshToken" (id, "tenantId", "userId", "tokenHash", "expiresAt") VALUES ('${ROW_B}', '${TENANT_B}', '${USER_B}', 'hash_b', NOW() + INTERVAL '1 day')`,
        cleanup: `DELETE FROM "RefreshToken" WHERE id IN ('${ROW_A}','${ROW_B}')`,
      },
      {
        name: "EmailVerificationToken",
        insertA: `INSERT INTO "EmailVerificationToken" (id, "tenantId", "userId", token, "expiresAt") VALUES ('${ROW_A}', '${TENANT_A}', '${USER_A}', 'tok_evt_a', NOW() + INTERVAL '1 day')`,
        insertB: `INSERT INTO "EmailVerificationToken" (id, "tenantId", "userId", token, "expiresAt") VALUES ('${ROW_B}', '${TENANT_B}', '${USER_B}', 'tok_evt_b', NOW() + INTERVAL '1 day')`,
        cleanup: `DELETE FROM "EmailVerificationToken" WHERE id IN ('${ROW_A}','${ROW_B}')`,
      },
      {
        name: "PasswordResetToken",
        insertA: `INSERT INTO "PasswordResetToken" (id, "tenantId", "userId", token, "expiresAt") VALUES ('${ROW_A}', '${TENANT_A}', '${USER_A}', 'tok_prt_a', NOW() + INTERVAL '1 day')`,
        insertB: `INSERT INTO "PasswordResetToken" (id, "tenantId", "userId", token, "expiresAt") VALUES ('${ROW_B}', '${TENANT_B}', '${USER_B}', 'tok_prt_b', NOW() + INTERVAL '1 day')`,
        cleanup: `DELETE FROM "PasswordResetToken" WHERE id IN ('${ROW_A}','${ROW_B}')`,
      },
      {
        name: "ConsentOtpToken",
        insertA: `INSERT INTO "ConsentOtpToken" (id, "tenantId", "userId", token, "expiresAt") VALUES ('${ROW_A}', '${TENANT_A}', '${USER_A}', 'tok_cot_a', NOW() + INTERVAL '1 day')`,
        insertB: `INSERT INTO "ConsentOtpToken" (id, "tenantId", "userId", token, "expiresAt") VALUES ('${ROW_B}', '${TENANT_B}', '${USER_B}', 'tok_cot_b', NOW() + INTERVAL '1 day')`,
        cleanup: `DELETE FROM "ConsentOtpToken" WHERE id IN ('${ROW_A}','${ROW_B}')`,
      },
      {
        name: "PasswordHistory",
        insertA: `INSERT INTO "PasswordHistory" (id, "tenantId", "userId", "passwordHash") VALUES ('${ROW_A}', '${TENANT_A}', '${USER_A}', 'hash_a')`,
        insertB: `INSERT INTO "PasswordHistory" (id, "tenantId", "userId", "passwordHash") VALUES ('${ROW_B}', '${TENANT_B}', '${USER_B}', 'hash_b')`,
        cleanup: `DELETE FROM "PasswordHistory" WHERE id IN ('${ROW_A}','${ROW_B}')`,
      },
      {
        name: "WhatsappOtp",
        insertA: `INSERT INTO "WhatsappOtp" (id, "tenantId", "userId", "codeHash", phone, "expiresAt") VALUES ('${ROW_A}', '${TENANT_A}', '${USER_A}', 'h', '+520000000001', NOW() + INTERVAL '5 min')`,
        insertB: `INSERT INTO "WhatsappOtp" (id, "tenantId", "userId", "codeHash", phone, "expiresAt") VALUES ('${ROW_B}', '${TENANT_B}', '${USER_B}', 'h', '+520000000002', NOW() + INTERVAL '5 min')`,
        cleanup: `DELETE FROM "WhatsappOtp" WHERE id IN ('${ROW_A}','${ROW_B}')`,
      },
      {
        name: "DeleteOtp",
        // actorUserId @unique — usamos USER_A/B como actor; targetUserId también requerido.
        insertA: `INSERT INTO "DeleteOtp" (id, "tenantId", "actorUserId", "targetUserId", "otpHash", "expiresAt") VALUES ('${ROW_A}', '${TENANT_A}', '${USER_A}', '${USER_A}', 'h', NOW() + INTERVAL '5 min')`,
        insertB: `INSERT INTO "DeleteOtp" (id, "tenantId", "actorUserId", "targetUserId", "otpHash", "expiresAt") VALUES ('${ROW_B}', '${TENANT_B}', '${USER_B}', '${USER_B}', 'h', NOW() + INTERVAL '5 min')`,
        cleanup: `DELETE FROM "DeleteOtp" WHERE id IN ('${ROW_A}','${ROW_B}')`,
      },
    ];

    beforeAll(async () => {
      if (!setupReady) return;
      for (const t of tables) {
        await prismaSuper.$executeRawUnsafe(t.cleanup); // safety
        await prismaSuper.$executeRawUnsafe(t.insertA);
        await prismaSuper.$executeRawUnsafe(t.insertB);
      }
    });

    afterAll(async () => {
      if (!setupReady) return;
      for (const t of tables) {
        await prismaSuper.$executeRawUnsafe(t.cleanup);
      }
    });

    for (const t of tables) {
      it(`${t.name}: tenant A NO ve filas de B`, async () => {
        if (!requireSetup()) return;
        const rows = await prismaSuper.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL ROLE velumapp`);
          await tx.$executeRaw`SELECT set_config('app.tenant_id', ${TENANT_A}, true)`;
          return tx.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT id FROM "${t.name}" WHERE id IN ('${ROW_A}','${ROW_B}')`,
          );
        });
        const ids = rows.map((r) => r.id);
        expect(ids).toContain(ROW_A);
        expect(ids).not.toContain(ROW_B);
      });

      it(`${t.name}: tenant B NO ve filas de A`, async () => {
        if (!requireSetup()) return;
        const rows = await prismaSuper.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL ROLE velumapp`);
          await tx.$executeRaw`SELECT set_config('app.tenant_id', ${TENANT_B}, true)`;
          return tx.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT id FROM "${t.name}" WHERE id IN ('${ROW_A}','${ROW_B}')`,
          );
        });
        const ids = rows.map((r) => r.id);
        expect(ids).toContain(ROW_B);
        expect(ids).not.toContain(ROW_A);
      });
    }
  });

  // ── Fase 1.5 Slice C — marketing + agenda multi-tenant ───────────────
  //
  // Cobertura: Lead, MarketingAttribution, AgendaPolicy, AgendaCabin,
  // AgendaTreatment, AgendaTreatmentCabinRule, AgendaWeeklyRule,
  // AgendaSpecialDateRule, AgendaBlockedSlot.
  //
  // Notas: AgendaTreatmentCabinRule depende de AgendaTreatment+AgendaCabin
  // (FK cascade). Insertamos las dependencias antes; la regla usa los
  // mismos ids ROW_A/ROW_B.
  describe("Slice C — marketing + agenda (Lead, MarketingAttribution, AgendaPolicy, AgendaCabin, AgendaTreatment, AgendaTreatmentCabinRule, AgendaWeeklyRule, AgendaSpecialDateRule, AgendaBlockedSlot)", () => {
    const ROW_A = "rls_crow_a";
    const ROW_B = "rls_crow_b";

    type ChildTable = {
      name: string;
      insertA: string;
      insertB: string;
      cleanup: string;
    };

    // El orden importa: AgendaTreatmentCabinRule depende de
    // AgendaTreatment + AgendaCabin → setup las primeras.
    const tables: ChildTable[] = [
      {
        name: "Lead",
        insertA: `INSERT INTO "Lead" (id, "tenantId", name, email, phone, consent, "updatedAt") VALUES ('${ROW_A}', '${TENANT_A}', 'A', 'a@l.local', '+5210000001', true, NOW())`,
        insertB: `INSERT INTO "Lead" (id, "tenantId", name, email, phone, consent, "updatedAt") VALUES ('${ROW_B}', '${TENANT_B}', 'B', 'b@l.local', '+5210000002', true, NOW())`,
        cleanup: `DELETE FROM "Lead" WHERE id IN ('${ROW_A}','${ROW_B}')`,
      },
      {
        name: "MarketingAttribution",
        insertA: `INSERT INTO "MarketingAttribution" (id, "tenantId", "leadId", "updatedAt") VALUES ('${ROW_A}', '${TENANT_A}', '${ROW_A}', NOW())`,
        insertB: `INSERT INTO "MarketingAttribution" (id, "tenantId", "leadId", "updatedAt") VALUES ('${ROW_B}', '${TENANT_B}', '${ROW_B}', NOW())`,
        cleanup: `DELETE FROM "MarketingAttribution" WHERE id IN ('${ROW_A}','${ROW_B}')`,
      },
      {
        name: "AgendaPolicy",
        insertA: `INSERT INTO "AgendaPolicy" (id, "tenantId", "updatedAt") VALUES ('${ROW_A}', '${TENANT_A}', NOW())`,
        insertB: `INSERT INTO "AgendaPolicy" (id, "tenantId", "updatedAt") VALUES ('${ROW_B}', '${TENANT_B}', NOW())`,
        cleanup: `DELETE FROM "AgendaPolicy" WHERE id IN ('${ROW_A}','${ROW_B}')`,
      },
      {
        name: "AgendaCabin",
        insertA: `INSERT INTO "AgendaCabin" (id, "tenantId", name, "updatedAt") VALUES ('${ROW_A}', '${TENANT_A}', 'CabA', NOW())`,
        insertB: `INSERT INTO "AgendaCabin" (id, "tenantId", name, "updatedAt") VALUES ('${ROW_B}', '${TENANT_B}', 'CabB', NOW())`,
        cleanup: `DELETE FROM "AgendaCabin" WHERE id IN ('${ROW_A}','${ROW_B}')`,
      },
      {
        name: "AgendaTreatment",
        insertA: `INSERT INTO "AgendaTreatment" (id, "tenantId", name, code, "updatedAt") VALUES ('${ROW_A}', '${TENANT_A}', 'TrA', 'rls_test_code', NOW())`,
        insertB: `INSERT INTO "AgendaTreatment" (id, "tenantId", name, code, "updatedAt") VALUES ('${ROW_B}', '${TENANT_B}', 'TrB', 'rls_test_code', NOW())`,
        cleanup: `DELETE FROM "AgendaTreatment" WHERE id IN ('${ROW_A}','${ROW_B}')`,
      },
      {
        name: "AgendaTreatmentCabinRule",
        insertA: `INSERT INTO "AgendaTreatmentCabinRule" (id, "tenantId", "treatmentId", "cabinId", "updatedAt") VALUES ('${ROW_A}', '${TENANT_A}', '${ROW_A}', '${ROW_A}', NOW())`,
        insertB: `INSERT INTO "AgendaTreatmentCabinRule" (id, "tenantId", "treatmentId", "cabinId", "updatedAt") VALUES ('${ROW_B}', '${TENANT_B}', '${ROW_B}', '${ROW_B}', NOW())`,
        cleanup: `DELETE FROM "AgendaTreatmentCabinRule" WHERE id IN ('${ROW_A}','${ROW_B}')`,
      },
      {
        name: "AgendaWeeklyRule",
        insertA: `INSERT INTO "AgendaWeeklyRule" (id, "tenantId", "dayOfWeek", "updatedAt") VALUES ('${ROW_A}', '${TENANT_A}', 0, NOW())`,
        insertB: `INSERT INTO "AgendaWeeklyRule" (id, "tenantId", "dayOfWeek", "updatedAt") VALUES ('${ROW_B}', '${TENANT_B}', 0, NOW())`,
        cleanup: `DELETE FROM "AgendaWeeklyRule" WHERE id IN ('${ROW_A}','${ROW_B}')`,
      },
      {
        name: "AgendaSpecialDateRule",
        insertA: `INSERT INTO "AgendaSpecialDateRule" (id, "tenantId", "dateKey", "updatedAt") VALUES ('${ROW_A}', '${TENANT_A}', '2099-01-01', NOW())`,
        insertB: `INSERT INTO "AgendaSpecialDateRule" (id, "tenantId", "dateKey", "updatedAt") VALUES ('${ROW_B}', '${TENANT_B}', '2099-01-01', NOW())`,
        cleanup: `DELETE FROM "AgendaSpecialDateRule" WHERE id IN ('${ROW_A}','${ROW_B}')`,
      },
      {
        name: "AgendaBlockedSlot",
        insertA: `INSERT INTO "AgendaBlockedSlot" (id, "tenantId", "dateKey", "startMinute", "endMinute", "updatedAt") VALUES ('${ROW_A}', '${TENANT_A}', '2099-01-01', 0, 30, NOW())`,
        insertB: `INSERT INTO "AgendaBlockedSlot" (id, "tenantId", "dateKey", "startMinute", "endMinute", "updatedAt") VALUES ('${ROW_B}', '${TENANT_B}', '2099-01-01', 0, 30, NOW())`,
        cleanup: `DELETE FROM "AgendaBlockedSlot" WHERE id IN ('${ROW_A}','${ROW_B}')`,
      },
    ];

    beforeAll(async () => {
      if (!setupReady) return;
      // Cleanup en orden inverso por las FKs cascade
      for (let i = tables.length - 1; i >= 0; i--) {
        await prismaSuper.$executeRawUnsafe(tables[i].cleanup);
      }
      for (const t of tables) {
        await prismaSuper.$executeRawUnsafe(t.insertA);
        await prismaSuper.$executeRawUnsafe(t.insertB);
      }
    });

    afterAll(async () => {
      if (!setupReady) return;
      for (let i = tables.length - 1; i >= 0; i--) {
        await prismaSuper.$executeRawUnsafe(tables[i].cleanup);
      }
    });

    for (const t of tables) {
      it(`${t.name}: tenant A NO ve filas de B`, async () => {
        if (!requireSetup()) return;
        const rows = await prismaSuper.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL ROLE velumapp`);
          await tx.$executeRaw`SELECT set_config('app.tenant_id', ${TENANT_A}, true)`;
          return tx.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT id FROM "${t.name}" WHERE id IN ('${ROW_A}','${ROW_B}')`,
          );
        });
        const ids = rows.map((r) => r.id);
        expect(ids).toContain(ROW_A);
        expect(ids).not.toContain(ROW_B);
      });

      it(`${t.name}: tenant B NO ve filas de A`, async () => {
        if (!requireSetup()) return;
        const rows = await prismaSuper.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL ROLE velumapp`);
          await tx.$executeRaw`SELECT set_config('app.tenant_id', ${TENANT_B}, true)`;
          return tx.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT id FROM "${t.name}" WHERE id IN ('${ROW_A}','${ROW_B}')`,
          );
        });
        const ids = rows.map((r) => r.id);
        expect(ids).toContain(ROW_B);
        expect(ids).not.toContain(ROW_A);
      });
    }
  });
});
