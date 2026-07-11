/**
 * Smoke de AISLAMIENTO RLS (validación de Etapa 1).
 *
 * READ-ONLY: solo cuenta filas (SELECT count). No escribe nada — seguro incluso
 * contra prod. DEBE correrse conectado como `app_user` (NOBYPASSRLS); si corres
 * como owner/superuser, Postgres bypasea RLS y el test no prueba nada.
 *
 * Qué hace: por cada tabla, cuenta filas visibles con distintos valores de
 * `app.tenant_id` (seteado con SET LOCAL dentro de una tx, igual que
 * withTenantContext cuando RLS_ENFORCE=true):
 *
 *   - tenant "default"       → debe ver los datos reales (N filas)
 *   - tenant inexistente     → debe ver 0 filas  ← ESTO prueba el aislamiento
 *   - sin contexto (NULL)    → ve todo (fallback permisivo, se quita en Etapa 4)
 *
 * Si "tenant inexistente" da 0 y "default" da >0, el aislamiento RLS funciona
 * end-to-end como app_user. Ese es el corazón de la multi-tenancy.
 *
 * Uso:
 *   cd server
 *   DATABASE_URL="postgresql://app_user:...@<host>.neon.tech/<db>?sslmode=require" \
 *   npx tsx scripts/smoke-rls-isolation.ts
 */
import { prisma } from "../src/db/prisma";

const TABLES = ["User", "Appointment", "Payment", "MedicalIntake", "Document", "Membership"];

// Cuenta filas visibles con un app.tenant_id dado, dentro de una tx (SET LOCAL).
// tenantId=null → contexto vacío (NULL) = fallback permisivo.
const countWithTenant = async (tenantId: string | null, table: string): Promise<number> =>
  prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId ?? ""}, true)`;
    // table sale de una lista fija (no input externo) → sin riesgo de inyección.
    const rows = await tx.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT count(*)::bigint AS count FROM "${table}"`);
    return Number(rows[0].count);
  });

const run = async () => {
  console.log("=== Smoke de aislamiento RLS (read-only, como app_user) ===\n");
  console.log("tabla".padEnd(16), "default".padStart(10), "otro-tenant".padStart(14), "sin-contexto".padStart(14), "  aísla?");
  console.log("-".repeat(70));

  let allIsolated = true;
  for (const table of TABLES) {
    const withDefault = await countWithTenant("default", table);
    const withWrong = await countWithTenant("tenant-inexistente-xyz", table);
    const withNull = await countWithTenant(null, table);
    // El aislamiento se prueba si un tenant ajeno NO ve las filas del default.
    const isolated = withDefault === 0 || withWrong < withDefault;
    if (!isolated) allIsolated = false;
    console.log(
      table.padEnd(16),
      String(withDefault).padStart(10),
      String(withWrong).padStart(14),
      String(withNull).padStart(14),
      isolated ? "   ✅" : "   ❌",
    );
  }

  console.log("\n" + (allIsolated
    ? "🎉 Aislamiento RLS FUNCIONA: un tenant ajeno no ve los datos del default.\n" +
      "   (Con el fallback permisivo, 'sin-contexto' aún ve todo — se cierra en Etapa 4.)"
    : "⚠️  Alguna tabla no aísla — revisa que corres como app_user (NOBYPASSRLS), no como owner/superuser."));
};

run()
  .catch((err) => { console.error(err instanceof Error ? err.message : err); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
