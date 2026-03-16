import dotenv from "dotenv";

dotenv.config();

// ──────────────────────────────────────────────────────────────
// Secretos críticos: el servidor NO debe arrancar sin ellos.
// Un placeholder conocido es tan peligroso como un valor vacío.
// ──────────────────────────────────────────────────────────────
const KNOWN_PLACEHOLDERS = new Set([
  "",
  "change-me",
  "change-this-32-byte-secret",
  "pon_aqui_un_token_largo_de_32+_caracteres",
]);

function requireSecret(name: string, minLength = 32): string {
  const value = process.env[name] ?? "";
  if (KNOWN_PLACEHOLDERS.has(value) || value.length < minLength) {
    throw new Error(
      `[env] La variable de entorno "${name}" es insegura o está vacía. ` +
      `Genera un secreto con: node -e "require('crypto').randomBytes(48).toString('hex')"`
    );
  }
  return value;
}

function requireEnv(name: string): string {
  const value = process.env[name] ?? "";
  if (!value) {
    throw new Error(`[env] La variable de entorno "${name}" es obligatoria y está vacía.`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  appUrl: process.env.APP_URL ?? "http://localhost:5173",
  apiUrl: process.env.API_URL ?? "http://localhost:4000",
  databaseUrl: requireEnv("DATABASE_URL"),
  jwtSecret: requireSecret("JWT_SECRET", 32),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "1d",
  cookieName: process.env.COOKIE_NAME ?? "velum_token",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  stripePortalReturnUrl: process.env.STRIPE_PORTAL_RETURN_URL ?? "http://localhost:5173/account",
  uploadDir: process.env.UPLOAD_DIR ?? "/var/velum/uploads",
  uploadMaxSize: Number(process.env.UPLOAD_MAX_SIZE ?? 10 * 1024 * 1024),
  gracePeriodDays: Number(process.env.GRACE_PERIOD_DAYS ?? 5),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  metaEnabled: process.env.META_ENABLED === "true",
  metaApiVersion: process.env.META_API_VERSION ?? "v20.0",
  metaPixelId: process.env.META_PIXEL_ID ?? "",
  metaAccessToken: process.env.META_ACCESS_TOKEN ?? "",
  appointmentRescheduleMinHours: Number(process.env.APPOINTMENT_RESCHEDULE_MIN_HOURS ?? 24),
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI ?? "",
  integrationsEncKey: requireSecret("INTEGRATIONS_ENC_KEY", 32),
  baseUrl: process.env.BASE_URL ?? "http://localhost:4000",
  defaultClinicId: process.env.DEFAULT_CLINIC_ID ?? "default",
  googleSyncIgnoreWindowSeconds: Number(process.env.GOOGLE_SYNC_IGNORE_WINDOW_SECONDS ?? 10),
  resendFromEmail: process.env.RESEND_FROM_EMAIL ?? "noreply@velumlaser.com"
};

export const isProduction = env.nodeEnv === "production";
