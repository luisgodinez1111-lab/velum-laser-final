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
  databaseUrl: (() => {
    const url = requireEnv("DATABASE_URL");
    try { new URL(url); } catch {
      throw new Error(`[env] DATABASE_URL no es una URL válida: "${url.slice(0, 40)}..."`);
    }
    return url;
  })(),
  jwtSecret: requireSecret("JWT_SECRET", 32),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "1d",
  cookieName: process.env.COOKIE_NAME ?? "velum_token",
  stripeSecretKey: (() => {
    const key = process.env.STRIPE_SECRET_KEY ?? "";
    if (!key && process.env.NODE_ENV === "production") {
      throw new Error("[env] STRIPE_SECRET_KEY es obligatoria en producción");
    }
    return key;
  })(),
  stripeWebhookSecret: (() => {
    const key = process.env.STRIPE_WEBHOOK_SECRET ?? "";
    if (!key && process.env.NODE_ENV === "production") {
      throw new Error("[env] STRIPE_WEBHOOK_SECRET es obligatoria en producción");
    }
    return key;
  })(),
  stripePortalReturnUrl: process.env.STRIPE_PORTAL_RETURN_URL ?? "http://localhost:5173/account",
  uploadDir: process.env.UPLOAD_DIR ?? "/var/velum/uploads",
  uploadMaxSize: Number(process.env.UPLOAD_MAX_SIZE ?? 10 * 1024 * 1024),
  gracePeriodDays: Number(process.env.GRACE_PERIOD_DAYS ?? 5),
  corsOrigin: (() => {
    const origin = process.env.CORS_ORIGIN ?? "http://localhost:5173";
    if (!origin.trim()) {
      throw new Error("[env] CORS_ORIGIN está vacío. Define al menos un origen permitido.");
    }
    return origin;
  })(),
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
  resendFromEmail: process.env.RESEND_FROM_EMAIL ?? "noreply@velumlaser.com",
  resendKeyVerification: process.env.RESEND_KEY_VERIFICATION ?? "",
  resendKeyReset:        process.env.RESEND_KEY_RESET        ?? "",
  resendKeyReminders:    process.env.RESEND_KEY_REMINDERS    ?? "",
  resendKeyDocuments:    process.env.RESEND_KEY_DOCUMENTS    ?? "",
  resendKeyAdminInvite:        process.env.RESEND_KEY_ADMIN_INVITE        ?? "",
  resendKeyNotifications:      process.env.RESEND_KEY_NOTIFICATIONS      ?? "",
  adminNotificationEmail:      process.env.ADMIN_NOTIFICATION_EMAIL      ?? "",
  stripePublishableKey:        process.env.STRIPE_PUBLISHABLE_KEY        ?? "",
  refreshCookieName: process.env.REFRESH_COOKIE_NAME ?? "velum_refresh",
  refreshTokenExpiresDays: Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? 30),
  errorWebhookUrl: process.env.ERROR_WEBHOOK_URL ?? "",
  healthApiKey: process.env.HEALTH_API_KEY ?? "",
  stripeCheckoutBaseUrl: process.env.STRIPE_CHECKOUT_BASE_URL ?? "",
  integrationJobPollMs: Number(process.env.INTEGRATION_JOB_POLL_MS ?? 2000),
  integrationWatchSweepMs: Number(process.env.INTEGRATION_WATCH_SWEEP_MS ?? 15 * 60 * 1000),
  clinicContactPhone:    process.env.CLINIC_CONTACT_PHONE    ?? "+52 55 1234 5678",
  clinicContactWhatsapp: process.env.CLINIC_CONTACT_WHATSAPP ?? "5215512345678",
  clinicContactEmail:    process.env.CLINIC_CONTACT_EMAIL    ?? "concierge@velumlaser.com",
  recurringChargeRenewMs: Number(process.env.RECURRING_CHARGE_RENEW_MS ?? 60 * 60 * 1000), // hourly

  // ── Observabilidad (Fase 0.5/0.6) ──────────────────────────────────
  // Sentry: si SENTRY_DSN está vacío, el SDK no se inicializa (degradación silenciosa).
  sentryDsn: process.env.SENTRY_DSN ?? "",
  sentryEnvironment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
  sentryRelease: process.env.SENTRY_RELEASE ?? "",
  sentryTracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  sentryProfilesSampleRate: Number(process.env.SENTRY_PROFILES_SAMPLE_RATE ?? 0),

  // ── OpenTelemetry (Fase 0.6) ───────────────────────────────────────
  // Si OTEL_EXPORTER_OTLP_ENDPOINT está vacío, el SDK no se inicializa.
  // Para Grafana Cloud: https://otlp-gateway-<region>.grafana.net/otlp
  otelEnabled: !!process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  otelEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "",
  // Headers en formato OTLP estándar: "Authorization=Basic base64(id:token),..."
  otelHeaders: process.env.OTEL_EXPORTER_OTLP_HEADERS ?? "",
  otelServiceName: process.env.OTEL_SERVICE_NAME ?? "velum-api",
  otelDeploymentEnv: process.env.OTEL_DEPLOYMENT_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
  otelTracesSampler: process.env.OTEL_TRACES_SAMPLER ?? "parentbased_traceidratio",
  otelTracesSamplerArg: Number(process.env.OTEL_TRACES_SAMPLER_ARG ?? 0.1),

  // ── Multi-tenancy / RLS (Fase 0.4) ─────────────────────────────────
  // Cuando `true`, el helper `withTenantContext()` ejecuta SET LOCAL
  // app.tenant_id en cada query envuelta. Sin esto, las RLS policies
  // permiten todo (fallback). Activar SOLO cuando la conexión use rol
  // no-superuser (Fase 1), porque postgres bypassea RLS.
  rlsEnforce: process.env.RLS_ENFORCE === "true",
};

export const isProduction = env.nodeEnv === "production";
