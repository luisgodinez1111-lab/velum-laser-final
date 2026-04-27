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
const prismaSuper = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

const TENANT_A = "rls_test_a";
const TENANT_B = "rls_test_b";
const USER_A = "rls_user_a";
const USER_B = "rls_user_b";

// Skip si: no hay DB, o el setup de Fase 1.4.a (rol velumapp + FORCE RLS) no está
// presente. Evita falsos positivos en CI básico antes de que el workflow lo prepare.
let setupReady = false;

describe.skipIf(!process.env.DATABASE_URL)("RLS tenant isolation", () => {
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
});
