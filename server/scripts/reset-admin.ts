/**
 * Reset / alta idempotente de la cuenta admin.
 *
 * Resuelve el caso "credenciales inválidas" tras el cutover a Neon: el seed
 * (`ensureUser`) IGNORA usuarios ya existentes, así que cambiar ADMIN_PASSWORD
 * en Render no actualiza la contraseña; y con RUN_SEED=false el seed ni corre.
 * Este script sí actualiza (upsert): crea el admin si falta, o resetea su
 * contraseña si ya existe. Fuerza cambio de contraseña en el primer login.
 *
 * Es idempotente — correrlo varias veces deja el mismo estado.
 *
 * Depende SOLO de DATABASE_URL (no arrastra la validación de env.ts), por lo
 * que se puede correr localmente contra Neon sin exportar el resto de secrets.
 *
 * Uso (contra Neon):
 *   # Local, apuntando a la conexión DIRECTA de Neon (sin -pooler):
 *   cd server
 *   ADMIN_EMAIL="admin@velum.mx" \
 *   ADMIN_PASSWORD="TuPasswordSegura123!" \
 *   DATABASE_URL="postgresql://...neon.tech/db?sslmode=require" \
 *   npx tsx scripts/reset-admin.ts
 *
 *   # O en Render Shell (DATABASE_URL ya está en el entorno):
 *   ADMIN_PASSWORD="TuPasswordSegura123!" npx tsx scripts/reset-admin.ts
 *
 * Variables:
 *   ADMIN_EMAIL        (opcional, default "admin@velum.mx") — se normaliza a minúsculas
 *   ADMIN_PASSWORD     (obligatoria) — debe cumplir la política de fuerza
 *   DATABASE_URL       (obligatoria) — conexión a la base
 *   ADMIN_MUST_CHANGE  (opcional, default "true") — si "false", NO fuerza el
 *                      cambio de contraseña en el primer login. Útil para entrar
 *                      de inmediato sin depender del overlay ForcePasswordChange.
 */
import bcrypt from "bcryptjs";
import { prisma } from "../src/db/prisma";

// Réplica de la política de fuerza (utils/auth.validatePasswordStrength). Se
// duplica a propósito para no importar utils/auth, que arrastra env.ts y
// exigiría exportar todos los secrets para correr el script.
const validatePasswordStrength = (password: string): string | null => {
  if (password.length < 12) return "La contraseña debe tener al menos 12 caracteres";
  if (!/[A-Z]/.test(password)) return "Debe incluir al menos una letra mayúscula";
  if (!/[a-z]/.test(password)) return "Debe incluir al menos una letra minúscula";
  if (!/[0-9]/.test(password)) return "Debe incluir al menos un número";
  if (!/[^A-Za-z0-9]/.test(password)) return "Debe incluir al menos un símbolo";
  return null;
};

const run = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error("[reset-admin] DATABASE_URL es obligatoria (apunta a la conexión directa de Neon).");
  }

  // El login es case-sensitive con el email; normalizamos para evitar
  // desajustes por mayúsculas/espacios entre lo seedeado y lo tecleado.
  const email = (process.env.ADMIN_EMAIL ?? "admin@velum.mx").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    throw new Error("[reset-admin] ADMIN_PASSWORD es obligatoria (sin default). Exportala antes de correr.");
  }

  // La política de fuerza se valida al cambiar contraseña; si la temporal no la
  // cumple, el primer cambio forzado la rechazaría. Abortamos temprano y claro.
  const weak = validatePasswordStrength(password);
  if (weak) {
    throw new Error(`[reset-admin] ADMIN_PASSWORD no cumple la política: ${weak}`);
  }

  // 12 rounds — mismo cost factor que utils/auth.hashPassword.
  const passwordHash = await bcrypt.hash(password, 12);

  // Por defecto forzamos cambio en el primer login (seguridad). Se puede
  // desactivar con ADMIN_MUST_CHANGE=false para entrar de inmediato.
  const mustChangePassword = (process.env.ADMIN_MUST_CHANGE ?? "true").toLowerCase() !== "false";

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      role: "admin",
      isActive: true,
      mustChangePassword
    },
    create: {
      email,
      passwordHash,
      role: "admin",
      isActive: true,
      mustChangePassword,
      profile: {
        create: { firstName: "Admin", lastName: "Velum" }
      }
    },
    select: { id: true, email: true, role: true }
  });

  console.log(
    `[reset-admin] ${existing ? "ACTUALIZADO" : "CREADO"} → email=${user.email} role=${user.role} id=${user.id} mustChangePassword=${mustChangePassword}`
  );
  console.log(
    mustChangePassword
      ? "[reset-admin] Listo. Inicia sesión; se pedirá cambiar la contraseña en el primer acceso."
      : "[reset-admin] Listo. Inicia sesión con ese email y contraseña (sin cambio forzado)."
  );
};

run()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
