/**
 * Test de AISLAMIENTO RLS con DOS tenants (Multi-tenancy — Etapa 3).
 *
 * Prueba el criterio "vendible": un tenant A NUNCA ve datos de un tenant B.
 * A diferencia de smoke-rls-isolation.ts (que compara datos reales vs un tenant
 * inexistente), aquí se crean DOS tenants con datos propios y se verifica el
 * aislamiento cruzado en ambas direcciones, además de que las escrituras
 * cross-tenant quedan bloqueadas.
 *
 * IMPORTANTE: DEBE correrse conectado como `app_user` (NOBYPASSRLS). Si corres
 * como owner/superuser, Postgres BYPASSEA RLS y el test fallará (correctamente)
 * avisándote. No depende de RLS_ENFORCE: setea `app.tenant_id` con SET LOCAL
 * directamente (igual que withTenantContext), así prueba la RLS a nivel de BD.
 *
 * Escribe y borra datos de prueba (tenants con slug/id `__rls_test_*`). Es
 * idempotente: limpia restos previos antes de sembrar y limpia todo al final.
 * Recomendado correrlo contra un BRANCH de Neon, no contra prod.
 *
 * Uso:
 *   cd server
 *   DATABASE_URL="postgresql://app_user:...@<host>.neon.tech/<db>?sslmode=require" \
 *   npx tsx scripts/rls-isolation-2tenants.ts
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../src/db/prisma";

const A = "__rls_test_a";
const B = "__rls_test_b";
const MARKER = "__rls_test_"; // prefijo de slug/email para identificar lo sembrado

// Tablas tenant-scoped a ejercitar en la prueba viva, con su columna de tenant.
// (User y Appointment usan `clinicId`; el resto `tenantId`.)
const LIVE_TABLES: Array<{ table: string; col: "clinicId" | "tenantId" }> = [
  { table: "User", col: "clinicId" },
  { table: "Appointment", col: "clinicId" },
  { table: "Payment", col: "tenantId" },
  { table: "MedicalIntake", col: "tenantId" },
];

let failures = 0;
const check = (ok: boolean, label: string) => {
  console.log(`  ${ok ? "✅" : "❌"} ${label}`);
  if (!ok) failures++;
};

/** Ejecuta fn dentro de una tx con app.tenant_id seteado (como withTenantContext). */
const asTenant = <T>(tenantId: string | null, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> =>
  prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId ?? ""}, true)`;
    return fn(tx);
  });

/** Cuenta filas de una tabla filtradas por columna de tenant, bajo el contexto ctx. */
const countRowsOfTenant = (ctx: string, table: string, col: string, ofTenant: string): Promise<number> =>
  asTenant(ctx, async (tx) => {
    // table y col salen de listas fijas (sin input externo) → sin inyección.
    const rows = await tx.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT count(*)::bigint AS count FROM "${table}" WHERE "${col}" = $1`,
      ofTenant,
    );
    return Number(rows[0].count);
  });

// ── Preflight: rol de conexión ───────────────────────────────────────────────
const preflight = async () => {
  const [{ current_user: role, is_super: sup, bypass }] = await prisma.$queryRaw<
    Array<{ current_user: string; is_super: boolean; bypass: boolean }>
  >`SELECT current_user, current_setting('is_superuser')::bool AS is_super,
           (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass`;
  console.log(`Conexión: role=${role} · superuser=${sup} · bypassrls=${bypass}`);
  if (sup || bypass) {
    console.log(
      "⚠️  Estás conectado con un rol que BYPASSEA RLS. El aislamiento no se puede\n" +
      "    probar así — reconéctate como app_user (NOBYPASSRLS).",
    );
  }
  console.log();
};

// ── Parte 1: auditoría de cobertura de policies (cada tabla tenant-scoped) ────
const auditPolicyCoverage = async () => {
  console.log("── Parte 1: cobertura de RLS en tablas tenant-scoped ──");
  // Auto-descubre toda tabla con columna tenantId o clinicId.
  const cols = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT DISTINCT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name IN ('tenantId', 'clinicId')
    ORDER BY table_name`;
  // Estado RLS por tabla.
  const rls = await prisma.$queryRaw<Array<{ relname: string; enabled: boolean; forced: boolean }>>`
    SELECT c.relname, c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'`;
  // Policies existentes por tabla.
  const pols = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT DISTINCT tablename FROM pg_policies WHERE schemaname = 'public'`;

  const rlsMap = new Map(rls.map((r) => [r.relname, r]));
  const polSet = new Set(pols.map((p) => p.tablename));

  for (const { table_name } of cols) {
    const r = rlsMap.get(table_name);
    const hasPolicy = polSet.has(table_name);
    const ok = !!r?.enabled && hasPolicy;
    check(
      ok,
      `${table_name.padEnd(28)} rls=${r?.enabled ? "on " : "OFF"} force=${r?.forced ? "on " : "off"} policy=${hasPolicy ? "sí" : "NO"}`,
    );
  }
  console.log();
};

// ── Seed / cleanup ────────────────────────────────────────────────────────────
const cleanup = async () => {
  for (const t of [A, B]) {
    await asTenant(t, async (tx) => {
      await tx.payment.deleteMany({ where: { tenantId: t } });
      await tx.medicalIntake.deleteMany({ where: { tenantId: t } });
      await tx.appointment.deleteMany({ where: { clinicId: t } });
      await tx.user.deleteMany({ where: { clinicId: t } });
    });
  }
  // Tenant no es tenant-scoped (sin RLS) → borrado directo.
  await prisma.tenant.deleteMany({ where: { slug: { startsWith: MARKER } } });
};

const seedTenant = async (tenantId: string) => {
  // Tenant: sin RLS.
  await prisma.tenant.create({
    data: { id: tenantId, slug: tenantId, legalName: `RLS Test ${tenantId}`, displayName: `RLS ${tenantId}` },
  });
  // Datos tenant-scoped: sembrados con el contexto del tenant (WITH CHECK).
  await asTenant(tenantId, async (tx) => {
    const user = await tx.user.create({
      data: { email: `${MARKER}${tenantId}@test.invalid`, passwordHash: "x", clinicId: tenantId },
    });
    await tx.payment.create({ data: { userId: user.id, tenantId, amount: 100, currency: "mxn" } });
    await tx.medicalIntake.create({ data: { userId: user.id, tenantId } });
    const now = new Date();
    await tx.appointment.create({
      data: {
        userId: user.id,
        createdByUserId: user.id, // NOT NULL en la BD gestionada (drift vs schema opcional)
        clinicId: tenantId,
        startAt: now,
        endAt: new Date(now.getTime() + 3_600_000),
      },
    });
  });
};

// ── Parte 2: prueba viva de aislamiento cruzado ───────────────────────────────
const auditLiveIsolation = async () => {
  console.log("── Parte 2: aislamiento cruzado con 2 tenants (datos reales) ──");
  for (const { table, col } of LIVE_TABLES) {
    // Bajo el contexto de A: ve las suyas (>0) y CERO de B; simétrico para B.
    const aSeesA = await countRowsOfTenant(A, table, col, A);
    const aSeesB = await countRowsOfTenant(A, table, col, B);
    const bSeesB = await countRowsOfTenant(B, table, col, B);
    const bSeesA = await countRowsOfTenant(B, table, col, A);
    check(
      aSeesA > 0 && aSeesB === 0 && bSeesB > 0 && bSeesA === 0,
      `${table.padEnd(16)} A→A=${aSeesA} A→B=${aSeesB} · B→B=${bSeesB} B→A=${bSeesA}`,
    );
  }
  console.log();

  console.log("── Parte 2b: escrituras cross-tenant bloqueadas ──");
  // UPDATE de B desde el contexto de A → 0 filas afectadas.
  const affected = await asTenant(A, async (tx) => {
    const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `UPDATE "Payment" SET currency = 'zzz' WHERE "tenantId" = $1 RETURNING id`,
      B,
    );
    return rows.length;
  });
  check(affected === 0, `UPDATE de Payment de B desde contexto A afecta 0 filas (fue ${affected})`);

  // INSERT con tenantId de B desde el contexto de A → WITH CHECK lo rechaza.
  let insertBlocked = false;
  // Obtenemos un userId válido de B bajo el contexto de B (funciona en modo
  // permisivo y fail-closed); el INSERT sí corre bajo contexto A.
  const uidB = await asTenant(B, async (tx) => {
    const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM "User" WHERE "clinicId" = $1 LIMIT 1`,
      B,
    );
    return rows[0]?.id ?? "missing";
  });
  try {
    await asTenant(A, async (tx) => {
      await tx.$executeRawUnsafe(
        `INSERT INTO "Payment" (id, "tenantId", "userId", status, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, 'pending', now(), now())`,
        `${MARKER}xtenant`, B, uidB,
      );
    });
  } catch {
    insertBlocked = true; // WITH CHECK violation esperado
  }
  check(insertBlocked, "INSERT de Payment con tenantId=B desde contexto A es rechazado (WITH CHECK)");
  console.log();
};

// ── Parte 3: modo de la policy (permisivo vs fail-closed) ─────────────────────
// Informativo: sin contexto, como app_user, ¿cuántas filas de prueba se ven?
//   0  → fail-closed (Etapa 4 aplicada) · >0 → permisivo (fallback IS NULL aún activo).
const auditPolicyMode = async () => {
  console.log("── Parte 3: modo de la policy (informativo) ──");
  const seenNoCtx = await asTenant(null, async (tx) => {
    const rows = await tx.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT count(*)::bigint AS count FROM "User" WHERE "clinicId" IN ($1, $2)`,
      A, B,
    );
    return Number(rows[0].count);
  });
  console.log(seenNoCtx === 0
    ? "  ✅ FAIL-CLOSED: sin contexto se ven 0 filas de prueba (Etapa 4 aplicada)."
    : `  ℹ️  PERMISIVO: sin contexto se ven ${seenNoCtx} filas (fallback IS NULL — pre-Etapa 4).`);
  console.log();
};

const run = async () => {
  console.log("=== Test de aislamiento RLS — 2 tenants (Etapa 3) ===\n");
  await preflight();
  await auditPolicyCoverage();

  // Prueba viva: limpiar restos previos → sembrar → verificar → limpiar.
  await cleanup();
  try {
    await seedTenant(A);
    await seedTenant(B);
    await auditLiveIsolation();
    await auditPolicyMode();
  } finally {
    await cleanup();
  }

  console.log(failures === 0
    ? "🎉 AISLAMIENTO VERIFICADO: ningún dato cruza entre tenants (lecturas y escrituras)."
    : `⚠️  ${failures} verificación(es) fallaron — revisa arriba y confirma que corres como app_user.`);
  if (failures > 0) process.exitCode = 1;
};

run()
  .catch((err) => { console.error(err instanceof Error ? err.stack : err); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
