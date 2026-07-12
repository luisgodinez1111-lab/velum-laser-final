/**
 * Verificación de precondiciones RLS (Etapa 0-1 del plan de multi-tenancy).
 *
 * READ-ONLY: solo inspecciona el estado de la base. No cambia nada. Corre esto
 * contra STAGING (una branch de Neon) — o incluso contra prod para ver el estado
 * actual — antes de conectar la app como app_user y activar RLS_ENFORCE.
 *
 * Uso:
 *   cd server
 *   DATABASE_URL="postgresql://<owner>@<host>.neon.tech/<db>?sslmode=require" \
 *   npx tsx scripts/verify-rls-setup.ts
 *
 * Solo depende de DATABASE_URL (no arrastra env.ts).
 */
import { prisma } from "../src/db/prisma";

// Tablas tenant-scoped clave a verificar (una muestra representativa).
const KEY_TABLES = ["User", "Appointment", "Payment", "MedicalIntake", "Document", "Membership"];

let failures = 0;
const ok = (msg: string) => console.log(`  ✅ ${msg}`);
const bad = (msg: string) => { console.log(`  ❌ ${msg}`); failures++; };

const run = async () => {
  console.log("=== Verificación de setup RLS (read-only) ===\n");

  // 0. ¿Como QUÉ rol conecta ESTA sesión? — el gate de Etapa 4.
  //    Si la app conecta como un rol con BYPASSRLS/superuser, las policies NO
  //    filtran (fail-closed no aísla). Debe conectar como app_user (NOBYPASSRLS).
  console.log("0. Conexión actual (¿este DATABASE_URL respeta RLS?)");
  const conn = await prisma.$queryRaw<Array<{ current_user: string; is_super: boolean; bypassrls: boolean }>>`
    SELECT current_user,
           current_setting('is_superuser')::bool AS is_super,
           (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypassrls`;
  const c = conn[0];
  console.log(`  ℹ️  Conectado como: ${c.current_user}`);
  if (c.is_super) bad(`${c.current_user} ES superuser → BYPASSEA RLS (fail-closed NO aislaría). Conecta como app_user.`);
  else if (c.bypassrls) bad(`${c.current_user} tiene BYPASSRLS → NO respeta policies. Conecta como app_user para runtime.`);
  else ok(`${c.current_user} respeta RLS (NOSUPERUSER + NOBYPASSRLS) — correcto para el runtime de la app`);

  // 1. Rol app_user: existe + NOSUPERUSER + NOBYPASSRLS + LOGIN
  console.log("\n1. Rol app_user");
  const roles = await prisma.$queryRaw<Array<{ rolsuper: boolean; rolbypassrls: boolean; rolcanlogin: boolean }>>`
    SELECT rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = 'app_user'`;
  if (roles.length === 0) {
    bad("app_user NO existe — ¿corriste las migraciones en esta base?");
  } else {
    const r = roles[0];
    if (r.rolcanlogin) ok("app_user puede LOGIN"); else bad("app_user sin LOGIN");
    if (!r.rolsuper) ok("app_user NO es superuser"); else bad("app_user ES superuser (bypasea RLS — MAL)");
    if (!r.rolbypassrls) ok("app_user NOBYPASSRLS"); else bad("app_user tiene BYPASSRLS (MAL)");
  }

  // 2. RLS habilitado + forzado en las tablas clave
  console.log("\n2. RLS habilitado + forzado (FORCE) en tablas clave");
  for (const t of KEY_TABLES) {
    const rows = await prisma.$queryRaw<Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>>`
      SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = ${t} AND relkind = 'r'`;
    if (rows.length === 0) { bad(`${t}: tabla no encontrada`); continue; }
    const { relrowsecurity, relforcerowsecurity } = rows[0];
    if (relrowsecurity && relforcerowsecurity) ok(`${t}: RLS enabled + FORCE`);
    else bad(`${t}: RLS enabled=${relrowsecurity} force=${relforcerowsecurity} (se requiere ambos true)`);
  }

  // 3. Helper app_current_tenant_id() existe
  console.log("\n3. Helper app_current_tenant_id()");
  const fn = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'app_current_tenant_id') AS exists`;
  if (fn[0]?.exists) ok("app_current_tenant_id() existe"); else bad("falta app_current_tenant_id()");

  // 4. Políticas RLS presentes
  console.log("\n4. Políticas RLS");
  const policies = await prisma.$queryRaw<Array<{ tablename: string; policyname: string; qual: string | null }>>`
    SELECT tablename, policyname, qual FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename`;
  if (policies.length === 0) bad("no hay políticas RLS");
  else {
    ok(`${policies.length} políticas RLS en public`);
    // ¿Cuántas siguen con el fallback permisivo (IS NULL OR ...)?
    const permissive = policies.filter((p) => (p.qual ?? "").toLowerCase().includes("is null"));
    console.log(`  ℹ️  ${permissive.length}/${policies.length} políticas con fallback permisivo (IS NULL OR) — se quitan en Etapa 4`);
  }

  // 5. Grants de app_user en una tabla (muestra: User)
  console.log("\n5. Grants de app_user (muestra: User)");
  const grants = await prisma.$queryRaw<Array<{ privilege_type: string }>>`
    SELECT privilege_type FROM information_schema.role_table_grants
    WHERE grantee = 'app_user' AND table_schema = 'public' AND table_name = 'User'`;
  const have = new Set(grants.map((g) => g.privilege_type));
  for (const p of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
    if (have.has(p)) ok(`app_user tiene ${p} en User`); else bad(`app_user SIN ${p} en User`);
  }

  console.log("\n" + (failures === 0
    ? "🎉 Todo correcto — la base está lista para Etapa 1 (conectar como app_user + RLS_ENFORCE=true)."
    : `⚠️  ${failures} problema(s) — resuélvelos antes de conectar la app como app_user.`));
};

run()
  .catch((err) => { console.error(err instanceof Error ? err.message : err); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
